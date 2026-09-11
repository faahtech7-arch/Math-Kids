-- =========================================================================
-- Math Kids — Schema Supabase (histórias 3.1 / 3.2 / 3.4 / 3.8 / 3.9)
-- Rode este script inteiro no SQL Editor do Supabase (Project > SQL Editor)
-- =========================================================================

-- pgcrypto: usado para gerar hash do PIN (nunca guardamos PIN em texto puro).
-- No Supabase o pgcrypto vive no schema `extensions` (não em `public`), então
-- todas as funções abaixo usam `search_path = public, extensions` para enxergar
-- crypt() / gen_salt() / gen_random_bytes().
create extension if not exists pgcrypto;

-- -------------------------------------------------------------------------
-- Tabelas
-- -------------------------------------------------------------------------

create table if not exists responsaveis (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  contato     text not null,
  criado_em   timestamptz not null default now()
);

create table if not exists avatares (
  id              uuid primary key default gen_random_uuid(),
  nome_predefinido text not null,
  tipo            text not null,   -- shape usado no faceSVG (cat, robot, fox, owl...)
  cor             text not null,
  accent          text not null,
  pin_hash        text,            -- null até o responsável ativar o avatar
  responsavel_id  uuid references responsaveis(id),
  ativo           boolean not null default false,
  criado_em       timestamptz not null default now()
);

create table if not exists consentimentos (
  id              uuid primary key default gen_random_uuid(),
  responsavel_id  uuid not null references responsaveis(id),
  avatar_id       uuid not null references avatares(id),
  versao_termo    text not null,
  aceite          boolean not null default true,
  data_aceite     timestamptz not null default now()
);

-- -------------------------------------------------------------------------
-- RLS: bloqueia acesso direto às tabelas pela anon key.
-- Todo acesso do front-end passa pelas funções (RPC) abaixo, que rodam
-- com privilégio de dono (security definer) e nunca expõem pin_hash.
-- -------------------------------------------------------------------------

alter table responsaveis enable row level security;
alter table avatares enable row level security;
alter table consentimentos enable row level security;
-- (nenhuma policy criada de propósito — sem policy + RLS ligado = acesso
--  direto negado por padrão; só as funções abaixo conseguem ler/escrever)

-- -------------------------------------------------------------------------
-- Seed: avatares pré-definidos disponíveis para o responsável escolher
-- (equivalente ao AVAILABLE_POOL do protótipo front-end)
-- -------------------------------------------------------------------------

insert into avatares (nome_predefinido, tipo, cor, accent) values
  ('Ana',  'robot',   '#4CC9F0', '#2A9DC7'),
  ('Léo',  'dino',    '#7ED957', '#3F9B2A'),
  ('Mia',  'fox',     '#FF6F91', '#E14D72'),
  ('Théo', 'rocket',  '#FF9A3D', '#E0721A'),
  ('Sofi', 'bunny',   '#B892FF', '#8A5CE0'),
  ('Gael', 'star',    '#FFD23F', '#E0A800'),
  ('Bibi', 'owl',     '#2EC4B6', '#1B8E82'),
  ('Rex',  'bear',    '#FFB4A2', '#E88871'),
  ('Zuca', 'cat',     '#FF8C42', '#D96A1F'),
  ('Zog',  'alien',   '#8EE6CE', '#3FAF95'),
  ('Lila', 'unicorn', '#E3D6FF', '#B08EFF'),
  ('Pipo', 'panda',   '#F2F2F2', '#FF9FB2'),
  ('Bruk', 'shark',   '#4CC9F0', '#2A9DC7')
on conflict do nothing;

-- -------------------------------------------------------------------------
-- Funções (RPC) chamadas pelo front-end via supabase.rpc(...)
-- -------------------------------------------------------------------------

-- 1) Avatares já ativos (aparecem na tela "Quem vai jogar hoje?")
create or replace function listar_avatares_ativos()
returns table (id uuid, nome text, tipo text, cor text, accent text)
language sql
security definer
set search_path = public, extensions
as $$
  select id, nome_predefinido as nome, tipo, cor, accent
  from avatares
  where ativo = true
  order by criado_em asc;
$$;

-- 2) Avatares ainda sem responsável (história 3.2 — passo "escolher avatar")
create or replace function listar_avatares_disponiveis()
returns table (id uuid, nome text, tipo text, cor text, accent text)
language sql
security definer
set search_path = public, extensions
as $$
  select id, nome_predefinido as nome, tipo, cor, accent
  from avatares
  where responsavel_id is null and ativo = false
  order by criado_em asc;
$$;

-- 3) Login por avatar + PIN (história 3.1) — a comparação do PIN acontece
--    aqui dentro do Postgres via crypt(), nunca em texto puro no front-end.
create or replace function login_avatar(p_avatar_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
begin
  select pin_hash into v_hash
  from avatares
  where id = p_avatar_id and ativo = true;

  if v_hash is null then
    return false;
  end if;

  return v_hash = crypt(p_pin, v_hash);
end;
$$;

-- 4) Cadastro do responsável + consentimento + ativação do avatar (história 3.2)
--    Tudo em uma função só = tudo ou nada (se algo falhar, nada é gravado).
create or replace function cadastrar_responsavel(
  p_nome           text,
  p_contato        text,
  p_avatar_id      uuid,
  p_pin            text,
  p_versao_termo   text
)
returns table (avatar_id uuid, nome text, tipo text, cor text, accent text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_responsavel_id uuid;
begin
  if p_pin is null or length(p_pin) <> 4 then
    raise exception 'PIN precisa ter 4 dígitos';
  end if;

  insert into responsaveis (nome, contato)
  values (p_nome, p_contato)
  returning id into v_responsavel_id;

  insert into consentimentos (responsavel_id, avatar_id, versao_termo, aceite)
  values (v_responsavel_id, p_avatar_id, p_versao_termo, true);

  update avatares
  set responsavel_id = v_responsavel_id,
      pin_hash = crypt(p_pin, gen_salt('bf')),
      ativo = true
  where id = p_avatar_id and responsavel_id is null;

  if not found then
    raise exception 'Avatar já foi escolhido por outro responsável';
  end if;

  return query
    select a.id, a.nome_predefinido, a.tipo, a.cor, a.accent
    from avatares a
    where a.id = p_avatar_id;
end;
$$;

-- =========================================================================
-- Sessão + Progressão do jogo (Sistema de Pontuação / Fases / Progressão)
-- Histórias 4.x — a criança joga as 10 fases + extras e o progresso fica
-- salvo por avatar. Mesmo padrão de segurança: RLS ligado, sem policy, e
-- todo acesso pelas funções SECURITY DEFINER abaixo.
-- =========================================================================

-- Token de sessão emitido no login por avatar. Evita que qualquer cliente
-- grave progresso de um avatar sem saber o PIN dele.
create table if not exists sessoes (
  token      text primary key,
  avatar_id  uuid not null references avatares(id) on delete cascade,
  criada_em  timestamptz not null default now(),
  expira_em  timestamptz not null default (now() + interval '12 hours')
);
create index if not exists idx_sessoes_avatar on sessoes(avatar_id);

-- Uma linha por (avatar, fase). Guarda sempre o MELHOR desempenho.
create table if not exists progresso (
  avatar_id      uuid not null references avatares(id) on delete cascade,
  fase           int  not null,
  estrelas       int  not null default 0 check (estrelas between 0 and 3),
  melhor_pontos  int  not null default 0,
  melhor_acertos int  not null default 0,
  total_questoes int  not null default 0,
  concluida      boolean not null default false,
  tentativas     int  not null default 0,
  atualizado_em  timestamptz not null default now(),
  primary key (avatar_id, fase)
);

alter table sessoes  enable row level security;
alter table progresso enable row level security;

-- Helper interno: resolve o avatar dono de um token válido (não expirado).
-- Não é concedida ao anon; só as funções abaixo a usam.
create or replace function avatar_da_sessao(p_token text)
returns uuid
language sql
security definer
set search_path = public, extensions
as $$
  select avatar_id from sessoes
  where token = p_token and expira_em > now();
$$;
revoke execute on function avatar_da_sessao(text) from public;

-- 5) Login por avatar + PIN que DEVOLVE um token de sessão (história 3.1/4.1)
create or replace function iniciar_sessao(p_avatar_id uuid, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash  text;
  v_token text;
begin
  delete from sessoes where expira_em < now();

  select pin_hash into v_hash
  from avatares
  where id = p_avatar_id and ativo = true;

  if v_hash is null or v_hash <> crypt(p_pin, v_hash) then
    return null;
  end if;

  v_token := encode(gen_random_bytes(18), 'hex');
  insert into sessoes (token, avatar_id) values (v_token, p_avatar_id);
  return v_token;
end;
$$;

-- 6) Progresso completo do avatar logado (menu de fases)
create or replace function carregar_progresso(p_token text)
returns table (
  fase int, estrelas int, melhor_pontos int,
  melhor_acertos int, total_questoes int, concluida boolean, tentativas int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_avatar uuid := avatar_da_sessao(p_token);
begin
  if v_avatar is null then
    raise exception 'Sessão inválida ou expirada';
  end if;
  return query
    select p.fase, p.estrelas, p.melhor_pontos, p.melhor_acertos,
           p.total_questoes, p.concluida, p.tentativas
    from progresso p
    where p.avatar_id = v_avatar
    order by p.fase;
end;
$$;

-- 7) Salva o resultado de uma fase (mantém sempre o melhor)
create or replace function salvar_resultado_fase(
  p_token    text,
  p_fase     int,
  p_pontos   int,
  p_estrelas int,
  p_acertos  int,
  p_total    int
)
returns table (fase int, estrelas int, melhor_pontos int, concluida boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_avatar uuid := avatar_da_sessao(p_token);
begin
  if v_avatar is null then
    raise exception 'Sessão inválida ou expirada';
  end if;
  if p_fase is null or p_fase < 1 or p_fase > 999 then
    raise exception 'Fase inválida';
  end if;
  if p_estrelas < 0 or p_estrelas > 3 or p_acertos < 0
     or p_total <= 0 or p_total > 30 or p_acertos > p_total then
    raise exception 'Resultado inválido';
  end if;

  insert into progresso as pr
    (avatar_id, fase, estrelas, melhor_pontos, melhor_acertos,
     total_questoes, concluida, tentativas, atualizado_em)
  values
    (v_avatar, p_fase, greatest(p_estrelas, 0), greatest(p_pontos, 0), p_acertos,
     p_total, p_estrelas >= 1, 1, now())
  on conflict (avatar_id, fase) do update set
    estrelas       = greatest(pr.estrelas, excluded.estrelas),
    melhor_pontos  = greatest(pr.melhor_pontos, excluded.melhor_pontos),
    melhor_acertos = greatest(pr.melhor_acertos, excluded.melhor_acertos),
    total_questoes = excluded.total_questoes,
    concluida      = pr.concluida or excluded.concluida,
    tentativas     = pr.tentativas + 1,
    atualizado_em  = now();

  return query
    select pr.fase, pr.estrelas, pr.melhor_pontos, pr.concluida
    from progresso pr
    where pr.avatar_id = v_avatar and pr.fase = p_fase;
end;
$$;

-- 8) Logout explícito (opcional — a sessão também expira sozinha em 12h)
create or replace function encerrar_sessao(p_token text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  delete from sessoes where token = p_token;
$$;

-- -------------------------------------------------------------------------
-- Permissões: a anon key só pode EXECUTAR estas funções, não ler as tabelas
-- -------------------------------------------------------------------------
grant execute on function listar_avatares_ativos() to anon;
grant execute on function listar_avatares_disponiveis() to anon;
grant execute on function login_avatar(uuid, text) to anon;
grant execute on function cadastrar_responsavel(text, text, uuid, text, text) to anon;
grant execute on function iniciar_sessao(uuid, text) to anon;
grant execute on function carregar_progresso(text) to anon;
grant execute on function salvar_resultado_fase(text, int, int, int, int, int) to anon;
grant execute on function encerrar_sessao(text) to anon;

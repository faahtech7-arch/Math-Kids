-- =========================================================================
-- Math Kids — Schema Supabase (histórias 3.1 / 3.2 / 3.4 / 3.8 / 3.9)
-- Rode este script inteiro no SQL Editor do Supabase (Project > SQL Editor)
-- =========================================================================

-- pgcrypto: usado para gerar hash do PIN (nunca guardamos PIN em texto puro)
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
set search_path = public
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
set search_path = public
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
set search_path = public
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
set search_path = public
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

-- -------------------------------------------------------------------------
-- Permissões: a anon key só pode EXECUTAR estas funções, não ler as tabelas
-- -------------------------------------------------------------------------
grant execute on function listar_avatares_ativos() to anon;
grant execute on function listar_avatares_disponiveis() to anon;
grant execute on function login_avatar(uuid, text) to anon;
grant execute on function cadastrar_responsavel(text, text, uuid, text, text) to anon;

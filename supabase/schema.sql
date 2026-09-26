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

-- `where not exists` em vez de `on conflict`: a tabela não tem índice único
-- no nome, então `on conflict do nothing` nunca disparava e cada nova
-- execução do script duplicava os 13 avatares.
insert into avatares (nome_predefinido, tipo, cor, accent)
select v.nome, v.tipo, v.cor, v.accent
from (values
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
) as v(nome, tipo, cor, accent)
where not exists (select 1 from avatares a where a.nome_predefinido = v.nome);

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
  on conflict on constraint progresso_pkey do update set  -- por nome: `fase` também é coluna de retorno e ficaria ambígua
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

-- =========================================================================
-- Épico 3 — Conteúdo Pedagógico e Gestão de Fases (histórias 5.1 / 5.2 / 5.3)
-- =========================================================================
-- Por que esta seção existe:
--   Até aqui as fases e as contas viviam só no front-end (js/fases.js e
--   js/gerador.js). Funciona, mas ninguém do grupo consegue cadastrar uma
--   fase nova sem mexer em JavaScript. Aqui o conteúdo vira DADO: as fases,
--   os problemas prontos e os contextos do dia a dia moram no banco.
--
--   A regra de ouro do projeto continua valendo: se o Supabase cair, o jogo
--   continua jogável. Por isso cada fase guarda também as suas `regras`
--   (os MESMOS parâmetros que js/gerador.js usa) e nenhuma RPC desta seção
--   é obrigatória para a criança jogar — o front sempre tem plano B local.
--
--   Tudo aqui é IDEMPOTENTE: rodar este arquivo inteiro duas vezes não
--   duplica fase, contexto nem problema, e não estoura erro.
-- =========================================================================

-- -------------------------------------------------------------------------
-- Tabelas novas
-- -------------------------------------------------------------------------

-- Base que já tinha uma `fases` de um rascunho anterior (id uuid, sem as
-- colunas abaixo): o `create table if not exists` pularia a criação e o seed
-- quebraria por falta de coluna. Em vez de apagar, renomeamos para
-- `fases_legado` — nada se perde, e a tabela nova nasce no formato certo.
do $fases_legado$
declare
  r record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'fases'
      and column_name = 'id' and data_type <> 'integer'
  ) then
    if to_regclass('public.fases_legado') is not null then
      raise exception 'Existe uma tabela fases antiga (id não inteiro) e já existe fases_legado. Resolva à mão antes de rodar.';
    end if;
    alter table public.fases rename to fases_legado;
    -- nomes de constraint/índice são por schema: sem isto o `fases_pkey`
    -- antigo colide com o da tabela nova
    for r in
      select conname from pg_constraint
      where conrelid = 'public.fases_legado'::regclass
        and conname like 'fases\_%' and conname not like 'fases\_legado\_%'
    loop
      execute format('alter table public.fases_legado rename constraint %I to %I',
                     r.conname, 'fases_legado_' || substr(r.conname, 7));
    end loop;
    for r in
      select indexrelid::regclass::text as nome from pg_index
      where indrelid = 'public.fases_legado'::regclass
        and indexrelid::regclass::text like 'fases\_%'
        and indexrelid::regclass::text not like 'fases\_legado\_%'
    loop
      execute format('alter index public.%I rename to %I',
                     r.nome, 'fases_legado_' || substr(r.nome, 7));
    end loop;
    raise notice 'Tabela fases antiga renomeada para fases_legado.';
  end if;
end;
$fases_legado$;

-- Catálogo de fases. O `id` casa com `progresso.fase` (1..10 normais,
-- 101..103 extras) e a `ordem` é a sequência que a criança percorre:
-- 1..13 SEM FUROS, porque a liberação da fase N+1 depende da fase N.
create table if not exists fases (
  id                  int primary key,
  ordem               int  not null unique check (ordem >= 1),
  nome                text not null,
  icone               text not null,          -- emoji mostrado no cartão
  cor                 text not null,          -- hex, igual ao de js/fases.js
  operacao_principal  text not null check (operacao_principal in ('+','-','*','/','misto')),
  dificuldade         int  not null check (dificuldade between 1 and 5),
  dica                text,
  qtd_questoes        int  not null,
  tentativas          int  not null,
  tempo_seg           int  not null default 0, -- 0 = sem cronômetro
  meta_uma            numeric not null,        -- limiares de estrela (0.6 / 0.8 / 1.0)
  meta_duas           numeric not null,
  meta_tres           numeric not null,
  extra               boolean not null default false,
  regras              jsonb   not null default '{}'::jsonb, -- params do gerador local
  ativo               boolean not null default true,
  criado_em           timestamptz not null default now()
);

-- Banco de contas prontas. Cada linha é UMA questão com enunciado do dia a
-- dia e ilustração. `dados` guarda a conta em formato que o front entende:
--   { "partes": [14,"+",8], "operandos": [14,8],
--     "operadores": ["+"], "expressao": "14 + 8 =" }
-- `partes` usa operador ASCII (+ - * /) porque js/dicas.js lê esse array
-- para montar a dica; `expressao` já vem com o sinal bonito (× ÷ −).
create table if not exists problemas (
  id                 uuid primary key default gen_random_uuid(),
  fase_id            int  not null references fases(id) on delete cascade,
  tipo_operacao      text not null check (tipo_operacao in ('+','-','*','/','misto')),
  dados              jsonb not null,
  resposta_correta   int  not null check (resposta_correta between 0 and 99),
  elementos_visuais  jsonb not null default '{}'::jsonb, -- { emoji, tema, cor, alt }
  enunciado          text,
  tema               text,
  dificuldade        int  not null default 1 check (dificuldade between 1 and 5),
  ordem              int  not null default 0,
  ativo              boolean not null default true,
  criado_em          timestamptz not null default now()
);

-- Temas do dia a dia usados para escrever o enunciado de cada problema.
-- O template usa os marcadores {a} e {b} (e {r} só em texto de apoio —
-- NUNCA na pergunta, senão entrega a resposta).
create table if not exists contextos (
  id        int generated always as identity primary key,
  operacao  text not null check (operacao in ('+','-','*','/','misto')),
  tema      text not null,
  emoji     text not null,
  objeto    text not null,      -- ex.: maçãs, figurinhas, balões
  cor       text not null,
  template  text not null
);

-- Índices: os dois primeiros servem as RPCs; o único é a trava que impede
-- a MESMA conta aparecer duas vezes na mesma fase (e deixa o seed repetir
-- a execução sem duplicar nada).
create index if not exists idx_problemas_fase on problemas (fase_id);
create index if not exists idx_problemas_fase_curva on problemas (fase_id, dificuldade, ordem);
create unique index if not exists uq_problemas_fase_expressao
  on problemas (fase_id, ((dados ->> 'expressao')));
create index if not exists idx_contextos_operacao on contextos (operacao);
create unique index if not exists uq_contextos_operacao_tema on contextos (operacao, tema);

-- -------------------------------------------------------------------------
-- RLS: conteúdo é público e não tem dado pessoal nenhum, então aqui (ao
-- contrário das tabelas de cima) existe policy de LEITURA. Escrita continua
-- só pelo SQL Editor / service role — nenhuma policy de insert/update/delete.
-- -------------------------------------------------------------------------

alter table fases enable row level security;
alter table problemas enable row level security;
alter table contextos enable row level security;

drop policy if exists fases_leitura_publica on fases;
create policy fases_leitura_publica on fases
  for select to anon, authenticated using (ativo);

drop policy if exists problemas_leitura_publica on problemas;
create policy problemas_leitura_publica on problemas
  for select to anon, authenticated using (ativo);

drop policy if exists contextos_leitura_publica on contextos;
create policy contextos_leitura_publica on contextos
  for select to anon, authenticated using (true);

grant select on fases, problemas, contextos to anon, authenticated;

-- -------------------------------------------------------------------------
-- Seed das 13 fases — espelho fiel de js/fases.js
-- (fases 1..10 → ordem 1..10; extras 101,102,103 → ordem 11,12,13)
--
-- `regras` guarda os parâmetros do gerador local. Além das chaves de
-- operação ("+", "-", "*", "/") guardamos "operacoes" e "parcelas", que é o
-- que o gerador precisa para funcionar quando o front cai no plano B.
--
-- `on conflict do nothing`: rodar de novo não sobrescreve. Se alguém do
-- grupo quiser corrigir uma fase já semeada, roda um UPDATE à mão
-- (veja supabase/CONTEUDO.md).
-- -------------------------------------------------------------------------

insert into fases (id, ordem, nome, icone, cor, operacao_principal, dificuldade, dica,
                   qtd_questoes, tentativas, tempo_seg, meta_uma, meta_duas, meta_tres,
                   extra, regras) values
  (1, 1, 'Primeiras somas', '➕', '#2EC4B6', '+', 1,
   'Some os dois números e escreva a resposta.',
   8, 3, 0, 0.6, 0.8, 1.0, false,
   '{"operacoes":["+"],"parcelas":2,"+":{"aMin":1,"aMax":12,"bMin":1,"bMax":8,"somaMax":20}}'::jsonb),

  (2, 2, 'Menos e menos', '➖', '#4CC9F0', '-', 1,
   'Tire o segundo número do primeiro.',
   8, 3, 0, 0.6, 0.8, 1.0, false,
   '{"operacoes":["-"],"parcelas":2,"-":{"minMax":20,"subMin":1,"subMax":12}}'::jsonb),

  (3, 3, 'Vai e volta', '🔁', '#7ED957', 'misto', 2,
   'Presta atenção no sinal: pode ser mais ou menos.',
   8, 3, 0, 0.6, 0.8, 1.0, false,
   '{"operacoes":["+","-"],"parcelas":2,
     "+":{"aMin":5,"aMax":20,"bMin":3,"bMax":10,"somaMax":30},
     "-":{"minMax":30,"subMin":2,"subMax":15}}'::jsonb),

  (4, 4, 'Somas com dezenas', '🔢', '#FFD23F', '+', 2,
   'Soma números maiores. Vale contar de 10 em 10.',
   9, 3, 0, 0.6, 0.8, 1.0, false,
   '{"operacoes":["+"],"parcelas":2,"+":{"aMin":12,"aMax":58,"bMin":6,"bMax":40,"somaMax":99}}'::jsonb),

  (5, 5, 'Subtração com dezenas', '🧮', '#FF9A3D', '-', 2,
   'Tira o de baixo do de cima. Nunca fica negativo.',
   9, 3, 0, 0.6, 0.8, 1.0, false,
   '{"operacoes":["-"],"parcelas":2,"-":{"minMax":99,"subMin":8,"subMax":55}}'::jsonb),

  (6, 6, 'Tabuada fácil', '✖️', '#B892FF', '*', 3,
   'Multiplicação é soma repetida: 4×3 é 4+4+4.',
   9, 3, 0, 0.6, 0.8, 1.0, false,
   '{"operacoes":["*"],"parcelas":2,"*":{"tabuadas":[2,3,4,5],"outroMin":2,"outroMax":10}}'::jsonb),

  (7, 7, 'Tabuada braba', '💪', '#FF6F91', '*', 3,
   'As tabuadas do 6 ao 9. Respira e vai com calma.',
   9, 3, 0, 0.6, 0.8, 1.0, false,
   '{"operacoes":["*"],"parcelas":2,"*":{"tabuadas":[6,7,8,9],"outroMin":2,"outroMax":9}}'::jsonb),

  (8, 8, 'Dividir é repartir', '➗', '#2EC4B6', '/', 3,
   'Quantas vezes o segundo número cabe no primeiro?',
   9, 3, 0, 0.6, 0.8, 1.0, false,
   '{"operacoes":["/"],"parcelas":2,"/":{"divisores":[2,3,4,5],"quocMin":2,"quocMax":10}}'::jsonb),

  (9, 9, 'Divisão braba', '🚀', '#4CC9F0', '/', 4,
   'Divisão exata pelas tabuadas do 6 ao 9.',
   9, 3, 0, 0.6, 0.8, 1.0, false,
   '{"operacoes":["/"],"parcelas":2,"/":{"divisores":[6,7,8,9],"quocMin":2,"quocMax":9}}'::jsonb),

  (10, 10, 'Desafio final', '👑', '#FFD23F', 'misto', 4,
   'Tudo junto: mais, menos, vezes e dividir.',
   10, 3, 0, 0.6, 0.8, 1.0, false,
   '{"operacoes":["+","-","*","/"],"parcelas":2,
     "+":{"aMin":10,"aMax":55,"bMin":6,"bMax":40,"somaMax":99},
     "-":{"minMax":90,"subMin":6,"subMax":45},
     "*":{"tabuadas":[3,4,6,7,8],"outroMin":2,"outroMax":9},
     "/":{"divisores":[3,4,6,7,8],"quocMin":2,"quocMax":9}}'::jsonb),

  (101, 11, 'Trio de números', '🎲', '#7ED957', 'misto', 4,
   'Três números de uma vez! Resolve da esquerda pra direita.',
   8, 3, 0, 0.6, 0.8, 0.9, true,
   '{"operacoes":["+","-"],"parcelas":3,
     "+":{"aMin":3,"aMax":18,"bMin":2,"bMax":15,"somaMax":50},
     "-":{"minMax":40,"subMin":1,"subMax":12}}'::jsonb),

  (102, 12, 'Relâmpago da tabuada', '⚡', '#FF6F91', 'misto', 5,
   'Vezes e dividir contra o relógio: 10 segundos por conta.',
   10, 2, 10, 0.6, 0.8, 0.9, true,
   '{"operacoes":["*","/"],"parcelas":2,
     "*":{"tabuadas":[2,3,4,5,6,7,8,9],"outroMin":2,"outroMax":9},
     "/":{"divisores":[2,3,4,5,6,7,8,9],"quocMin":2,"quocMax":9}}'::jsonb),

  (103, 13, 'Missão maluca', '🌟', '#FFD23F', 'misto', 5,
   'As quatro operações com cronômetro. Foco total!',
   10, 2, 12, 0.6, 0.8, 0.9, true,
   '{"operacoes":["+","-","*","/"],"parcelas":2,
     "+":{"aMin":12,"aMax":55,"bMin":8,"bMax":40,"somaMax":99},
     "-":{"minMax":95,"subMin":8,"subMax":50},
     "*":{"tabuadas":[3,4,5,6,7,8,9],"outroMin":2,"outroMax":9},
     "/":{"divisores":[3,4,5,6,7,8,9],"quocMin":2,"quocMax":9}}'::jsonb)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- Seed dos contextos (história 5.3): pelo menos 6 temas do dia a dia por
-- operação. Linguagem de criança de 7 a 10 anos, nomes brasileiros e coisas
-- concretas: fruta, figurinha, brinquedo, festa, bichinho, lanche, escola.
--
-- Como os templates combinam com as contas geradas:
--   +  {a} é o que já tinha, {b} é o que chegou;
--   -  {a} é o total (sempre o maior), {b} é o que saiu;
--   *  {a} é quanto tem em cada grupo, {b} é a quantidade de grupos;
--   /  {a} é o total a repartir, {b} é em quantas partes iguais.
-- Os temas de 'misto' servem a fase do trio (três números), que monta a
-- frase com o `objeto` em vez do template — ver semear_problemas().
-- -------------------------------------------------------------------------

insert into contextos (operacao, tema, emoji, objeto, cor, template) values
  -- ➕ juntar, ganhar, chegar mais
  ('+', 'frutas',     '🍎', 'maçãs',      '#FF6F91', 'Ana colheu {a} maçãs no sítio e ganhou mais {b} da vovó. Com quantas maçãs ela ficou?'),
  ('+', 'figurinhas', '🃏', 'figurinhas', '#4CC9F0', 'Léo tinha {a} figurinhas no álbum e ganhou {b} do primo. Quantas figurinhas ele tem agora?'),
  ('+', 'brinquedos', '🧸', 'ursinhos',   '#FFB4A2', 'Mia guardou {a} ursinhos na caixa e depois colocou mais {b}. Quantos ursinhos ficaram na caixa?'),
  ('+', 'festa',      '🎈', 'balões',     '#FFD23F', 'A festa do Théo começou com {a} balões e chegaram mais {b}. Quantos balões tem a festa agora?'),
  ('+', 'bichinhos',  '🐟', 'peixinhos',  '#2EC4B6', 'No aquário da escola tinha {a} peixinhos e chegaram mais {b}. Quantos peixinhos tem no aquário?'),
  ('+', 'lanche',     '🍪', 'biscoitos',  '#FF9A3D', 'Sofi assou {a} biscoitos de manhã e mais {b} à tarde. Quantos biscoitos ela assou no dia?'),
  ('+', 'escola',     '✏️', 'lápis',      '#7ED957', 'A professora tinha {a} lápis na caixa e comprou mais {b}. Com quantos lápis ela ficou?'),

  -- ➖ tirar, dar, perder, gastar
  ('-', 'frutas',     '🍌', 'bananas',     '#FFD23F', 'Gael tinha {a} bananas e comeu {b} no lanche. Quantas bananas sobraram?'),
  ('-', 'figurinhas', '🃏', 'figurinhas',  '#4CC9F0', 'Bibi tinha {a} figurinhas e deu {b} para a amiga. Com quantas figurinhas ela ficou?'),
  ('-', 'brinquedos', '🚗', 'carrinhos',   '#FF6F91', 'Rex tinha {a} carrinhos e emprestou {b} para o irmão. Quantos carrinhos ficaram com ele?'),
  ('-', 'festa',      '🎈', 'balões',      '#B892FF', 'A festa tinha {a} balões e {b} estouraram. Quantos balões continuam cheios?'),
  ('-', 'bichinhos',  '🐦', 'passarinhos', '#7ED957', 'Tinha {a} passarinhos na árvore do quintal e {b} voaram. Quantos passarinhos ficaram?'),
  ('-', 'lanche',     '🍬', 'balas',       '#FF9A3D', 'Zuca tinha {a} balas no pote e chupou {b}. Quantas balas ainda tem no pote?'),
  ('-', 'escola',     '📚', 'livros',      '#2EC4B6', 'A estante tinha {a} livros e {b} foram emprestados. Quantos livros ficaram na estante?'),

  -- ✖️ grupos iguais: {a} em cada grupo, {b} grupos
  ('*', 'frutas',     '🍓', 'morangos',   '#FF6F91', 'Cada potinho tem {a} morangos. Lila comprou {b} potinhos. Quantos morangos ela levou para casa?'),
  ('*', 'figurinhas', '🃏', 'figurinhas', '#4CC9F0', 'Cada pacote vem com {a} figurinhas. Pipo abriu {b} pacotes. Quantas figurinhas ele juntou?'),
  ('*', 'brinquedos', '🚂', 'vagões',     '#7ED957', 'Cada trenzinho tem {a} vagões. Bruk montou {b} trenzinhos. Quantos vagões ele usou?'),
  ('*', 'festa',      '🧁', 'cupcakes',   '#FFD23F', 'Cada bandeja leva {a} cupcakes. A mãe de Duda encheu {b} bandejas. Quantos cupcakes ficaram prontos?'),
  ('*', 'bichinhos',  '🐞', 'joaninhas',  '#FF9A3D', 'Cada folha do jardim tem {a} joaninhas. Nina achou {b} folhas assim. Quantas joaninhas ela contou?'),
  ('*', 'lanche',     '🥪', 'sanduíches', '#FFB4A2', 'Cada caixinha leva {a} sanduíches. A escola preparou {b} caixinhas. Quantos sanduíches ao todo?'),
  ('*', 'esporte',    '⚽', 'bolas',      '#4CC9F0', 'Cada saco tem {a} bolas. O professor levou {b} sacos para o pátio. Quantas bolas ele levou?'),

  -- ➗ repartir em partes iguais: {a} no total, {b} partes
  ('/', 'frutas',     '🍊', 'laranjas',      '#FF9A3D', 'Mia tem {a} laranjas para dividir igualmente em {b} sacolas. Quantas laranjas vão em cada sacola?'),
  ('/', 'figurinhas', '🃏', 'figurinhas',    '#4CC9F0', 'Théo vai repartir {a} figurinhas igualmente entre {b} amigos. Quantas figurinhas cada amigo recebe?'),
  ('/', 'brinquedos', '🧩', 'peças',         '#B892FF', 'São {a} peças de quebra-cabeça para guardar em {b} caixas iguais. Quantas peças vão em cada caixa?'),
  ('/', 'festa',      '🍭', 'pirulitos',     '#FF6F91', 'Na festa tem {a} pirulitos para {b} mesas, a mesma quantidade em cada uma. Quantos pirulitos ficam em cada mesa?'),
  ('/', 'bichinhos',  '🐶', 'ossinhos',      '#FFB4A2', 'Sofi tem {a} ossinhos para dar igualmente a {b} cachorrinhos. Quantos ossinhos cada cachorrinho ganha?'),
  ('/', 'lanche',     '🍕', 'fatias',        '#FFD23F', 'A pizza foi cortada em {a} fatias para {b} crianças comerem a mesma quantidade. Quantas fatias cada criança come?'),
  ('/', 'escola',     '🖍️', 'gizes de cera', '#7ED957', 'A professora vai dividir {a} gizes de cera entre {b} grupos. Quantos gizes cada grupo recebe?'),

  -- 🎲 misto (fase do trio de números)
  ('misto', 'figurinhas', '🃏', 'figurinhas', '#4CC9F0', 'Rafa tinha {a} figurinhas e ganhou mais {b}. Quantas figurinhas ele tem agora?'),
  ('misto', 'frutas',     '🍇', 'uvas',       '#B892FF', 'Duda tinha {a} uvas no potinho e ganhou mais {b}. Quantas uvas ela tem agora?'),
  ('misto', 'brinquedos', '🪀', 'ioiôs',      '#FF6F91', 'Nina tinha {a} ioiôs e ganhou mais {b} na feira. Quantos ioiôs ela tem agora?'),
  ('misto', 'festa',      '🎁', 'presentes',  '#FFD23F', 'A festa tinha {a} presentes na mesa e chegaram mais {b}. Quantos presentes tem na mesa?'),
  ('misto', 'bichinhos',  '🐾', 'petiscos',   '#FF9A3D', 'O pote tinha {a} petiscos e Bibi colocou mais {b}. Quantos petiscos tem no pote?'),
  ('misto', 'lanche',     '🍿', 'pipocas',    '#FFB4A2', 'Gael tinha {a} pipocas no saquinho e pegou mais {b}. Quantas pipocas ele tem agora?')
on conflict (operacao, tema) do nothing;

-- -------------------------------------------------------------------------
-- Ajudantes do gerador (uso interno — não vão para o anon)
-- -------------------------------------------------------------------------

-- Inteiro aleatório entre p_min e p_max (inclusive), igual ao rint() do
-- js/gerador.js. Se alguém passar max < min, devolve min (nunca estoura).
create or replace function numero_aleatorio(p_min int, p_max int)
returns int
language sql
volatile
as $aleatorio$
  select p_min + floor(random() * (greatest(p_max, p_min) - p_min + 1))::int;
$aleatorio$;
revoke execute on function numero_aleatorio(int, int) from public;

-- Teto da faixa de números conforme a dificuldade do problema (1..5).
-- Dificuldade 1 usa só o comecinho da faixa da fase, dificuldade 5 usa a
-- faixa inteira. É isso que faz a fase começar fácil e ir apertando.
create or replace function limite_por_dificuldade(p_min int, p_max int, p_dificuldade int)
returns int
language sql
immutable
as $limite$
  select greatest(
           p_min,
           p_min + ceil((p_max - p_min) * least(greatest(coalesce(p_dificuldade, 1), 1), 5) / 5.0)::int
         );
$limite$;
revoke execute on function limite_por_dificuldade(int, int, int) from public;

-- Sinal bonito para exibição (o mesmo mapa do SINAL de js/gerador.js).
-- Atenção: aqui o menos é o sinal matemático U+2212, não o hífen.
create or replace function sinal_bonito(p_op text)
returns text
language sql
immutable
as $sinal$
  select case p_op
           when '+' then '+'
           when '-' then '−'
           when '*' then '×'
           when '/' then '÷'
           else coalesce(p_op, '?')
         end;
$sinal$;
revoke execute on function sinal_bonito(text) from public;

-- -------------------------------------------------------------------------
-- semear_problemas() — gera o acervo de contas de cada fase
--
-- Por fase gera max(24, qtd_questoes * 3) problemas DIFERENTES, seguindo as
-- `regras` da própria fase. Garantias (as mesmas do gerador do front):
--   - subtração nunca dá negativo;
--   - divisão sempre exata (o dividendo é montado como divisor × quociente);
--   - resposta entre 0 e 99 (no máximo 2 quadrados na tela);
--   - nenhuma conta repetida na mesma fase (trava no índice único);
--   - dificuldade 1..5 distribuída em curva crescente dentro da fase;
--   - TODO problema sai com enunciado do dia a dia e emoji preenchido.
--
-- Idempotente: só completa o que falta. Fase já cheia é pulada.
-- -------------------------------------------------------------------------
create or replace function semear_problemas()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $semear$
declare
  v_fase        record;
  v_ctx         record;
  v_alvo        int;
  v_existentes  int;
  v_criados     int;
  v_total       int := 0;
  v_regra       jsonb;
  v_ops         text[];
  v_parcelas    int;
  v_i           int;
  v_tent        int;
  v_dif         int;
  v_dif_faixa   int;       -- dificuldade usada para calcular a faixa de números
  v_op          text;
  v_op2         text;
  v_op3         text;
  v_tipo        text;
  v_ok          boolean;
  v_linhas      int;
  v_a           int;
  v_b           int;
  v_c           int;
  v_troca       int;
  v_resp        int;
  v_aMin        int;
  v_aMax        int;
  v_bMin        int;
  v_bMax        int;
  v_somaMax     int;
  v_minMax      int;
  v_subMin      int;
  v_subMax      int;
  v_outroMin    int;
  v_outroMax    int;
  v_quocMin     int;
  v_quocMax     int;
  v_lista       int[];
  v_partes      jsonb;
  v_operandos   jsonb;
  v_operadores  jsonb;
  v_expr        text;
  v_enunciado   text;
  v_emoji       text;
  v_tema        text;
  v_cor         text;
  v_alt         text;
  v_nome        text;
  v_nomes       text[] := array['Ana','Léo','Mia','Théo','Sofi','Gael','Bibi',
                                'Rex','Zuca','Lila','Pipo','Bruk','Duda','Nina','Rafa'];
begin
  for v_fase in select * from fases order by ordem loop
    v_alvo := greatest(24, v_fase.qtd_questoes * 3);

    select count(*) into v_existentes
    from problemas p
    where p.fase_id = v_fase.id;

    -- fase já semeada: não faz nada (é isto que deixa rodar o script 2x)
    if v_existentes >= v_alvo then
      continue;
    end if;

    v_regra := coalesce(v_fase.regras, '{}'::jsonb);

    -- operações da fase: a lista explícita ou, se faltar, as chaves de
    -- operador que existirem dentro de `regras`
    select coalesce(
             (select array_agg(x) from jsonb_array_elements_text(v_regra -> 'operacoes') as t(x)),
             (select array_agg(k order by k) from jsonb_object_keys(v_regra) as o(k)
               where k in ('+','-','*','/'))
           )
      into v_ops;
    if v_ops is null or coalesce(array_length(v_ops, 1), 0) = 0 then
      v_ops := array['+'];
    end if;

    v_parcelas := coalesce((v_regra ->> 'parcelas')::int, 2);
    v_criados  := 0;

    for v_i in (v_existentes + 1)..v_alvo loop
      -- curva de dificuldade: começa em 1 e termina em 5 dentro da fase
      v_dif := least(5, greatest(1, 1 + floor((v_i - 1)::numeric * 5 / v_alvo)::int));
      -- rodízio de operação: contas vizinhas nunca caem na mesma operação
      v_op  := v_ops[1 + ((v_i - 1) % array_length(v_ops, 1))];
      v_ok  := false;

      for v_tent in 1..80 loop
        -- nas primeiras tentativas respeitamos a faixa da dificuldade; se o
        -- acervo apertar (fases de tabuada têm poucas combinações), soltamos
        -- a faixa inteira para não faltar conta
        v_dif_faixa := case when v_tent > 40 then 5 else v_dif end;
        v_resp := null;

        if v_parcelas >= 3 then
          -- --- três parcelas (fase do trio): resolve da esquerda pra direita
          v_somaMax := coalesce((v_regra -> '+' ->> 'somaMax')::int, 50);
          v_a    := numero_aleatorio(3, 18);
          v_resp := v_a;

          v_op2 := v_ops[1 + floor(random() * array_length(v_ops, 1))::int];
          if v_op2 = '-' and v_resp <= 2 then v_op2 := '+'; end if;
          if v_op2 = '+' then
            v_b := numero_aleatorio(2, 15);
            if v_resp + v_b > v_somaMax then v_b := greatest(1, v_somaMax - v_resp); end if;
            v_resp := v_resp + v_b;
          else
            v_b := numero_aleatorio(1, least(12, v_resp));
            v_resp := v_resp - v_b;
          end if;

          v_op3 := v_ops[1 + floor(random() * array_length(v_ops, 1))::int];
          if v_op3 = '-' and v_resp <= 2 then v_op3 := '+'; end if;
          if v_op3 = '+' then
            v_c := numero_aleatorio(2, 15);
            if v_resp + v_c > v_somaMax then v_c := greatest(1, v_somaMax - v_resp); end if;
            v_resp := v_resp + v_c;
          else
            v_c := numero_aleatorio(1, least(12, v_resp));
            v_resp := v_resp - v_c;
          end if;

          v_tipo       := 'misto';
          v_partes     := jsonb_build_array(v_a, v_op2, v_b, v_op3, v_c);
          v_operandos  := jsonb_build_array(v_a, v_b, v_c);
          v_operadores := jsonb_build_array(v_op2, v_op3);
          v_expr       := format('%s %s %s %s %s =', v_a, sinal_bonito(v_op2), v_b,
                                 sinal_bonito(v_op3), v_c);

        elsif v_op = '+' then
          -- --- soma: respeita somaMax da fase
          v_aMin    := coalesce((v_regra -> '+' ->> 'aMin')::int, 1);
          v_aMax    := coalesce((v_regra -> '+' ->> 'aMax')::int, 20);
          v_bMin    := coalesce((v_regra -> '+' ->> 'bMin')::int, 1);
          v_bMax    := coalesce((v_regra -> '+' ->> 'bMax')::int, 20);
          v_somaMax := coalesce((v_regra -> '+' ->> 'somaMax')::int, 99);
          v_a := numero_aleatorio(v_aMin, limite_por_dificuldade(v_aMin, v_aMax, v_dif_faixa));
          v_b := numero_aleatorio(v_bMin, limite_por_dificuldade(v_bMin, v_bMax, v_dif_faixa));
          if v_a + v_b > v_somaMax then
            continue;
          end if;
          v_resp := v_a + v_b;
          v_tipo := '+';

        elsif v_op = '-' then
          -- --- subtração: o minuendo é sempre maior que o subtraendo,
          --     então o resultado NUNCA fica negativo
          v_minMax := coalesce((v_regra -> '-' ->> 'minMax')::int, 20);
          v_subMin := coalesce((v_regra -> '-' ->> 'subMin')::int, 1);
          v_subMax := coalesce((v_regra -> '-' ->> 'subMax')::int, greatest(1, v_minMax / 2));
          if v_subMax + 1 > v_minMax then
            continue;
          end if;
          v_a := numero_aleatorio(v_subMax + 1,
                                  limite_por_dificuldade(v_subMax + 1, v_minMax, v_dif_faixa));
          v_b := numero_aleatorio(v_subMin, least(v_subMax, v_a - 1));
          v_resp := v_a - v_b;
          v_tipo := '-';

        elsif v_op = '*' then
          -- --- multiplicação: uma parcela vem da tabuada da fase
          select array_agg(x::int) into v_lista
          from jsonb_array_elements_text(
                 coalesce(v_regra -> '*' -> 'tabuadas', '[2,3,4,5]'::jsonb)) as t(x);
          v_outroMin := coalesce((v_regra -> '*' ->> 'outroMin')::int, 2);
          v_outroMax := coalesce((v_regra -> '*' ->> 'outroMax')::int, 10);
          v_a := v_lista[1 + floor(random() * array_length(v_lista, 1))::int];
          v_b := numero_aleatorio(v_outroMin,
                                  limite_por_dificuldade(v_outroMin, v_outroMax, v_dif_faixa));
          -- às vezes a tabuada vem depois, pra criança não decorar a posição
          if random() < 0.5 then
            v_troca := v_a; v_a := v_b; v_b := v_troca;
          end if;
          v_resp := v_a * v_b;
          v_tipo := '*';

        elsif v_op = '/' then
          -- --- divisão: monta o dividendo a partir do quociente,
          --     então a divisão é SEMPRE exata (resto zero)
          select array_agg(x::int) into v_lista
          from jsonb_array_elements_text(
                 coalesce(v_regra -> '/' -> 'divisores', '[2,3,4,5]'::jsonb)) as t(x);
          v_quocMin := coalesce((v_regra -> '/' ->> 'quocMin')::int, 2);
          v_quocMax := coalesce((v_regra -> '/' ->> 'quocMax')::int, 10);
          v_b := v_lista[1 + floor(random() * array_length(v_lista, 1))::int];
          v_resp := numero_aleatorio(v_quocMin,
                                     limite_por_dificuldade(v_quocMin, v_quocMax, v_dif_faixa));
          v_a := v_b * v_resp;
          if v_a > 99 then
            continue;       -- conta com 3 dígitos não cabe na tela do jogo
          end if;
          v_tipo := '/';

        else
          continue;         -- operação desconhecida nas regras: ignora
        end if;

        -- trava geral: resposta precisa caber em 2 quadrados (0..99)
        if v_resp is null or v_resp < 0 or v_resp > 99 then
          continue;
        end if;

        if v_parcelas < 3 then
          v_partes     := jsonb_build_array(v_a, v_op, v_b);
          v_operandos  := jsonb_build_array(v_a, v_b);
          v_operadores := jsonb_build_array(v_op);
          v_expr       := format('%s %s %s =', v_a, sinal_bonito(v_op), v_b);
        end if;

        -- conta repetida nesta fase? tenta outra
        if exists (select 1 from problemas p
                    where p.fase_id = v_fase.id
                      and p.dados ->> 'expressao' = v_expr) then
          continue;
        end if;

        -- ---- enunciado do dia a dia + ilustração
        select c.* into v_ctx
        from contextos c
        where c.operacao = case when v_parcelas >= 3 then 'misto' else v_op end
        order by random()
        limit 1;

        if not found then
          -- sem tema cadastrado: ainda assim o problema sai com texto e emoji
          v_emoji := '🔢';
          v_tema  := 'numeros';
          v_cor   := v_fase.cor;
          v_alt   := 'números';
          v_enunciado := format('Resolva a conta %s e escreva o resultado.',
                                replace(v_expr, ' =', ''));
        else
          v_emoji := v_ctx.emoji;
          v_tema  := v_ctx.tema;
          v_cor   := v_ctx.cor;
          v_alt   := v_ctx.objeto;
          if v_parcelas >= 3 then
            -- no trio a frase conta os três passos na ordem da conta;
            -- "Quanto ficou" evita erro de concordância com o objeto
            v_nome := v_nomes[1 + floor(random() * array_length(v_nomes, 1))::int];
            v_enunciado := format(
              '%s começou com %s %s, %s %s e depois %s %s. Quanto ficou no final?',
              v_nome, v_a, v_ctx.objeto,
              case when v_op2 = '+' then 'ganhou mais' else 'deu' end, v_b,
              case when v_op3 = '+' then 'ganhou mais' else 'deu' end, v_c);
          else
            -- {r} nunca aparece em pergunta, mas trocamos por garantia
            v_enunciado := replace(
                             replace(
                               replace(v_ctx.template, '{a}', v_a::text),
                               '{b}', v_b::text),
                             '{r}', v_resp::text);
          end if;
        end if;

        insert into problemas (fase_id, tipo_operacao, dados, resposta_correta,
                               elementos_visuais, enunciado, tema, dificuldade, ordem)
        values (
          v_fase.id,
          v_tipo,
          jsonb_build_object('partes', v_partes, 'operandos', v_operandos,
                             'operadores', v_operadores, 'expressao', v_expr),
          v_resp,
          jsonb_build_object('emoji', v_emoji, 'tema', v_tema, 'cor', v_cor, 'alt', v_alt),
          v_enunciado,
          v_tema,
          v_dif,
          v_i
        )
        on conflict do nothing;

        get diagnostics v_linhas = row_count;
        if v_linhas = 1 then
          v_ok := true;
          exit;
        end if;
      end loop;

      if v_ok then
        v_criados := v_criados + 1;
      end if;
    end loop;

    v_total := v_total + v_criados;
    raise notice 'semear_problemas: fase % (%) ganhou % problemas novos (alvo %).',
      v_fase.id, v_fase.nome, v_criados, v_alvo;
  end loop;

  raise notice 'semear_problemas: % problemas novos no total.', v_total;
end;
$semear$;
revoke execute on function semear_problemas() from public;

-- -------------------------------------------------------------------------
-- Progressão no back-end (história 5.2)
-- A fase de ordem 1 está sempre liberada; a de ordem N+1 só abre quando a
-- de ordem N foi concluída (o projeto já define concluída = 1 estrela ou
-- mais). Se a fase nem existe na tabela `fases` (base ainda não semeada),
-- NÃO bloqueia — quem só rodou o schema antigo continua jogando.
-- -------------------------------------------------------------------------
create or replace function fase_liberada_para(p_avatar uuid, p_fase_id int)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $liberada_para$
declare
  v_ordem     int;
  v_anterior  int;
begin
  select f.ordem into v_ordem
  from fases f
  where f.id = p_fase_id and f.ativo;

  if v_ordem is null then
    return true;              -- fase fora do catálogo: compatibilidade
  end if;
  if v_ordem <= 1 then
    return true;              -- a primeira fase está sempre aberta
  end if;

  select f.id into v_anterior
  from fases f
  where f.ordem = v_ordem - 1 and f.ativo;

  if v_anterior is null then
    return true;              -- fase anterior desativada: não trava a criança
  end if;

  return exists (
    select 1 from progresso pr
    where pr.avatar_id = p_avatar
      and pr.fase = v_anterior
      and pr.concluida
  );
end;
$liberada_para$;
revoke execute on function fase_liberada_para(uuid, int) from public;

-- -------------------------------------------------------------------------
-- RPCs do conteúdo (chamadas pelo front via supabase.rpc)
-- -------------------------------------------------------------------------

-- 9) Catálogo público de fases (sem token — não tem nada pessoal aqui)
create or replace function listar_fases()
returns table (
  id int, ordem int, nome text, icone text, cor text, operacao_principal text,
  dificuldade int, dica text, qtd_questoes int, tentativas int, tempo_seg int,
  meta_uma numeric, meta_duas numeric, meta_tres numeric, extra boolean,
  regras jsonb, total_problemas int
)
language sql
security definer
set search_path = public, extensions
as $listar_fases$
  select f.id, f.ordem, f.nome, f.icone, f.cor, f.operacao_principal,
         f.dificuldade, f.dica, f.qtd_questoes, f.tentativas, f.tempo_seg,
         f.meta_uma, f.meta_duas, f.meta_tres, f.extra, f.regras,
         (select count(*)::int from problemas p
           where p.fase_id = f.id and p.ativo) as total_problemas
  from fases f
  where f.ativo
  order by f.ordem;
$listar_fases$;

-- 10) Uma fase inteira com todos os problemas dela (útil para pré-carregar
--     a partida e para conferir o conteúdo sem deploy). Fase inexistente
--     devolve {"fase": null, "problemas": []} em vez de erro.
create or replace function obter_fase(p_fase_id int)
returns jsonb
language sql
security definer
set search_path = public, extensions
as $obter_fase$
  select jsonb_build_object(
    'fase', (select to_jsonb(f) from fases f where f.id = p_fase_id and f.ativo),
    'problemas', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'id', p.id,
                  'tipo_operacao', p.tipo_operacao,
                  'dados', p.dados,
                  'resposta_correta', p.resposta_correta,
                  'elementos_visuais', p.elementos_visuais,
                  'enunciado', p.enunciado,
                  'tema', p.tema,
                  'dificuldade', p.dificuldade,
                  'ordem', p.ordem
                ) order by p.dificuldade, p.ordem)
       from problemas p
       where p.fase_id = p_fase_id and p.ativo),
      '[]'::jsonb)
  );
$obter_fase$;

-- 11) Catálogo + estado daquele avatar (é o que o menu de fases consome)
create or replace function listar_fases_progresso(p_token text)
returns table (
  id int, ordem int, nome text, icone text, cor text, operacao_principal text,
  dificuldade int, dica text, qtd_questoes int, tentativas int, tempo_seg int,
  meta_uma numeric, meta_duas numeric, meta_tres numeric, extra boolean,
  regras jsonb, total_problemas int,
  status text, estrelas int, melhor_pontos int, concluida boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $fases_progresso$
declare
  v_avatar uuid := avatar_da_sessao(p_token);
begin
  if v_avatar is null then
    raise exception 'Sessão inválida ou expirada';
  end if;

  return query
    select f.id, f.ordem, f.nome, f.icone, f.cor, f.operacao_principal,
           f.dificuldade, f.dica, f.qtd_questoes, f.tentativas, f.tempo_seg,
           f.meta_uma, f.meta_duas, f.meta_tres, f.extra, f.regras,
           (select count(*)::int from problemas p
             where p.fase_id = f.id and p.ativo),
           case
             when coalesce(pr.concluida, false) then 'concluida'::text
             when fase_liberada_para(v_avatar, f.id) then 'liberada'::text
             else 'bloqueada'::text
           end,
           coalesce(pr.estrelas, 0),
           coalesce(pr.melhor_pontos, 0),
           coalesce(pr.concluida, false)
    from fases f
    left join progresso pr on pr.avatar_id = v_avatar and pr.fase = f.id
    where f.ativo
    order by f.ordem;
end;
$fases_progresso$;

-- 12) Sorteio das contas de uma rodada (história 5.3)
--     Não é um "order by random()" simples: o sorteio monta a rodada com
--     dificuldade crescente E sem duas operações iguais em sequência.
--     Como funciona:
--       1. separa o acervo da fase, colocando no fim quem já caiu na rodada
--          anterior (p_excluir) — se o acervo for pequeno, reaproveita em
--          vez de devolver menos contas;
--       2. ordena o sorteio por dificuldade (empate no aleatório);
--       3. percorre essa fila escolhendo sempre o mais fácil que ainda não
--          foi usado E que tenha operação diferente da anterior. Quando a
--          fase só tem uma operação, simplesmente segue a curva.
create or replace function sortear_problemas(
  p_fase_id    int,
  p_quantidade int,
  p_excluir    uuid[] default '{}'::uuid[]
)
returns table (
  id uuid, fase_id int, tipo_operacao text, dados jsonb, resposta_correta int,
  elementos_visuais jsonb, enunciado text, tema text, dificuldade int
)
language plpgsql
security definer
set search_path = public, extensions
as $sortear$
declare
  v_qtd      int;
  v_ids      uuid[];
  v_ops      text[];
  v_n        int;
  v_usado    boolean[];
  v_fila     int[] := '{}';
  v_escolha  int;
  v_ultima   text;
  v_i        int;
  v_j        int;
begin
  v_qtd := coalesce(p_quantidade,
                    (select f.qtd_questoes from fases f where f.id = p_fase_id),
                    10);
  v_qtd := least(greatest(v_qtd, 1), 60);

  with base as (
    select p.id as pid,
           p.tipo_operacao as pop,
           p.dificuldade as pdif,
           (p.id = any (coalesce(p_excluir, '{}'::uuid[])))::int as repetido
    from problemas p
    where p.fase_id = p_fase_id and p.ativo
  ),
  escolhidos as (
    select pid, pop, pdif
    from base
    order by repetido asc, random()
    limit v_qtd
  ),
  ordenados as (
    select pid, pop,
           row_number() over (order by pdif asc, random()) as rn
    from escolhidos
  )
  select array_agg(pid order by rn), array_agg(pop order by rn)
    into v_ids, v_ops
  from ordenados;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return;               -- fase sem acervo: o front completa com o gerador local
  end if;

  v_usado  := array_fill(false, array[v_n]);
  v_ultima := null;

  for v_i in 1..v_n loop
    v_escolha := null;
    -- 1ª tentativa: o mais fácil ainda livre com operação diferente da última
    for v_j in 1..v_n loop
      if not v_usado[v_j] and (v_ultima is null or v_ops[v_j] is distinct from v_ultima) then
        v_escolha := v_j;
        exit;
      end if;
    end loop;
    -- 2ª tentativa: sobrou só a mesma operação, então segue a curva
    if v_escolha is null then
      for v_j in 1..v_n loop
        if not v_usado[v_j] then
          v_escolha := v_j;
          exit;
        end if;
      end loop;
    end if;

    v_usado[v_escolha] := true;
    v_ultima := v_ops[v_escolha];
    v_fila := v_fila || v_escolha;
  end loop;

  return query
    select p.id, p.fase_id, p.tipo_operacao, p.dados, p.resposta_correta,
           p.elementos_visuais, p.enunciado, p.tema, p.dificuldade
    from unnest(v_fila) with ordinality as s(idx, pos)
    join problemas p on p.id = v_ids[s.idx]
    order by s.pos;
end;
$sortear$;

-- 13) Confirmação de liberação para o front (o menu já sabe, mas a partida
--     confere antes de deixar jogar).
create or replace function fase_liberada(p_token text, p_fase_id int)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $fase_liberada$
declare
  v_avatar uuid := avatar_da_sessao(p_token);
begin
  if v_avatar is null then
    raise exception 'Sessão inválida ou expirada';
  end if;
  return fase_liberada_para(v_avatar, p_fase_id);
end;
$fase_liberada$;

-- -------------------------------------------------------------------------
-- salvar_resultado_fase — MESMA função de antes, agora com a trava de fase
-- bloqueada (história 5.2). Este create or replace substitui a versão
-- definida lá em cima; ele precisa vir DEPOIS de fase_liberada_para().
-- Todo o resto do comportamento continua idêntico: mesmas validações, mesmo
-- on conflict com greatest (guarda sempre o melhor) e mesmo retorno.
-- -------------------------------------------------------------------------
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
as $salvar$
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
  -- novo: ninguém grava pontos de uma fase que ainda não liberou
  if not fase_liberada_para(v_avatar, p_fase) then
    raise exception 'Fase bloqueada';
  end if;

  insert into progresso as pr
    (avatar_id, fase, estrelas, melhor_pontos, melhor_acertos,
     total_questoes, concluida, tentativas, atualizado_em)
  values
    (v_avatar, p_fase, greatest(p_estrelas, 0), greatest(p_pontos, 0), p_acertos,
     p_total, p_estrelas >= 1, 1, now())
  on conflict on constraint progresso_pkey do update set  -- por nome: `fase` também é coluna de retorno e ficaria ambígua
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
$salvar$;

-- -------------------------------------------------------------------------
-- Permissões do Épico 3 (o anon executa; fase_liberada_para e o seed ficam
-- de fora de propósito). O create or replace acima preserva os grants
-- antigos, mas repetimos o de salvar_resultado_fase para não depender disso.
-- -------------------------------------------------------------------------
grant execute on function listar_fases() to anon;
grant execute on function obter_fase(int) to anon;
grant execute on function listar_fases_progresso(text) to anon;
grant execute on function sortear_problemas(int, int, uuid[]) to anon;
grant execute on function fase_liberada(text, int) to anon;
grant execute on function salvar_resultado_fase(text, int, int, int, int, int) to anon;

-- -------------------------------------------------------------------------
-- Gera o acervo de contas. Rodar de novo é seguro: só completa o que falta.
-- -------------------------------------------------------------------------
select semear_problemas();

-- -------------------------------------------------------------------------
-- Conferência final: a ordem das fases não pode ter furo (senão a fase
-- seguinte nunca libera) e toda fase precisa de acervo de sobra.
-- -------------------------------------------------------------------------
do $valida$
declare
  r          record;
  v_fases    int;
  v_maior    int;
  v_furos    int;
  v_problemas int;
  v_magras   int := 0;
begin
  select count(*), coalesce(max(f.ordem), 0) into v_fases, v_maior from fases f;

  select count(*) into v_furos
  from generate_series(1, greatest(v_maior, 1)) as g(n)
  where not exists (select 1 from fases f where f.ordem = g.n);

  if v_fases > 0 and v_furos > 0 then
    raise exception 'Ordem das fases tem % furo(s) entre 1 e % — a progressão trava.',
      v_furos, v_maior;
  end if;

  select count(*) into v_problemas from problemas;

  raise notice '--- Épico 3: % fases (ordem 1..% sem furos), % problemas, % contextos ---',
    v_fases, v_maior, v_problemas, (select count(*) from contextos);

  for r in
    select f.ordem, f.id, f.nome, f.qtd_questoes,
           (select count(*) from problemas p where p.fase_id = f.id and p.ativo) as qtd
    from fases f
    order by f.ordem
  loop
    raise notice 'Fase % (id %) "%": % problemas (mínimo esperado %).',
      r.ordem, r.id, r.nome, r.qtd, r.qtd_questoes * 2;
    if r.qtd < r.qtd_questoes * 2 then
      v_magras := v_magras + 1;
    end if;
  end loop;

  if v_magras > 0 then
    raise warning '% fase(s) com pouco acervo — rode select semear_problemas(); de novo.',
      v_magras;
  else
    raise notice 'Todas as fases têm acervo suficiente. Conteúdo pronto para jogar.';
  end if;
end;
$valida$;

-- =========================================================================
-- Excluir avatar (Área do responsável)
-- =========================================================================
-- Os avatares são pré-definidos (seed lá em cima), então "excluir" não apaga
-- a linha: apaga tudo o que foi criado para a criança (PIN, progresso,
-- sessões, consentimento) e devolve o avatar para a lista de disponíveis.
-- Exige o PIN do avatar — é a única credencial que o sistema guarda.
-- O responsável que ficar sem nenhum avatar também é apagado (LGPD: não
-- guardar dado de contato sem finalidade).
create or replace function excluir_avatar(p_avatar_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash        text;
  v_responsavel uuid;
begin
  select pin_hash, responsavel_id into v_hash, v_responsavel
  from avatares
  where id = p_avatar_id and ativo = true
  for update;

  if v_hash is null or v_hash <> crypt(p_pin, v_hash) then
    return false;
  end if;

  delete from progresso      where avatar_id = p_avatar_id;
  delete from sessoes        where avatar_id = p_avatar_id;
  delete from consentimentos where avatar_id = p_avatar_id;

  update avatares
  set pin_hash = null, responsavel_id = null, ativo = false
  where id = p_avatar_id;

  if v_responsavel is not null
     and not exists (select 1 from avatares where responsavel_id = v_responsavel)
     and not exists (select 1 from consentimentos where responsavel_id = v_responsavel) then
    delete from responsaveis where id = v_responsavel;
  end if;

  return true;
end;
$$;

grant execute on function excluir_avatar(uuid, text) to anon;

# Integração Supabase — Math Kids

## O que mudou
- `js/script.js`: os arrays mockados `AVATARS`/`AVAILABLE_POOL` saíram. Agora
  tudo vem do Supabase via `supabase.rpc(...)`. Login e cadastro passaram a
  ser `async`.
- `js/config.js` (novo): guarda a URL e a `anon key` do seu projeto Supabase.
- `supabase/schema.sql` (novo): cria as tabelas `avatares`, `responsaveis`,
  `consentimentos` e as funções RPC que o front-end chama.
- `index.html`: o `<script>` agora é `type="module"` (necessário pro `import`
  do supabase-js e do `config.js` funcionar).

## Como o PIN fica seguro
O PIN nunca é comparado nem guardado em texto puro no front-end. Todo o
`crypt()`/hash roda dentro do Postgres, dentro das funções `login_avatar` e
`cadastrar_responsavel`. O RLS está ligado nas 3 tabelas sem nenhuma policy,
então a `anon key` só consegue *executar* essas funções — não consegue ler
ou escrever direto nas tabelas.

## Passo a passo

1. **Crie o projeto no Supabase** (se ainda não tiver um pra este jogo): em
   [supabase.com](https://supabase.com) → New Project.
2. **Rode o schema**: abra o **SQL Editor** do projeto, cole o conteúdo de
   `supabase/schema.sql` e execute. Isso cria as tabelas, já popula os 13
   avatares pré-definidos e cria as 4 funções RPC.
3. **Pegue suas credenciais**: em *Project Settings → API*, copie a
   **Project URL** e a **anon public key**.
4. **Preencha `js/config.js`** com esses dois valores.
5. **Suba pro GitHub/Vercel** normalmente — não precisa de variável de
   ambiente nem build step, é só HTML/CSS/JS puro.

## Testando
- Tela inicial deve listar os 6 avatares que já nascem `ativo = true`
  (Ana, Léo, Mia, Théo, Sofi, Gael) — se quiser, edite o `schema.sql` pra
  já deixar algum ativo com PIN, ou cadastre um pela própria tela do jogo.
- Pelo botão "Área do responsável" → "Cadastrar minha criança", o fluxo
  completo (dados → consentimento → escolher avatar + PIN) grava tudo via
  `cadastrar_responsavel` e o avatar novo aparece na tela inicial.

## Jogo: sessão + progressão (histórias 4.x)

O `schema.sql` agora também cria:

- **`sessoes`** — token opaco (hex de 36 chars) devolvido por `iniciar_sessao`
  no login por avatar + PIN. Expira em 12h. Todas as chamadas de progresso
  exigem esse token, então não dá pra gravar progresso de um avatar sem
  saber o PIN dele. O front guarda o token no `sessionStorage`
  (`js/sessao.js`), nunca o PIN.
- **`progresso`** — uma linha por `(avatar, fase)` com estrelas, melhor
  pontuação, acertos, se foi concluída e nº de tentativas. Guarda sempre o
  **melhor** desempenho (`greatest(...)` no `on conflict`).

Novas funções RPC (todas `security definer`, `grant execute ... to anon`):

| função | usada em | o que faz |
|---|---|---|
| `iniciar_sessao(avatar_id, pin)` | `js/script.js` | valida o PIN e devolve o token de sessão (ou `null`) |
| `carregar_progresso(token)` | `js/jogar.js`, `js/partida.js` | devolve o progresso de todas as fases do avatar |
| `salvar_resultado_fase(token, fase, pontos, estrelas, acertos, total)` | `js/partida.js` | grava o resultado da fase mantendo o melhor |
| `encerrar_sessao(token)` | botão "Sair" | apaga o token (logout) |

`avatar_da_sessao(token)` é um helper interno (não concedido ao `anon`).

Se você já rodou a versão anterior do `schema.sql`, é só rodar o arquivo
inteiro de novo no SQL Editor — tudo usa `create ... if not exists` e
`create or replace function`, então re-executar é seguro.

## Épico 3 — conteúdo pedagógico e fases

O `schema.sql` agora também cria o **conteúdo do jogo** no banco. Antes, as 13
fases viviam em `js/fases.js` e as contas eram sorteadas no navegador; agora o
Supabase é a fonte e o gerador local virou plano B.

- **`fases`** — a trilha: nome, ícone, cor, dificuldade, metas de estrela e o
  campo **`ordem`** (1..13, único e **sem furos**), que é quem define a cadeia
  de liberação.
- **`problemas`** — o acervo de contas de cada fase, com `dados` (jsonb, o
  mesmo formato para as 4 operações), `resposta_correta`, `enunciado`
  contextualizado e `elementos_visuais` (a ilustração).
- **`contextos`** — 34 temas do dia a dia (frutas, figurinhas, festa, lanche…)
  com modelos de frase usando `{a}` e `{b}`.

Estas três tabelas têm **RLS com policy de leitura pública** (`select` liberado
para `anon`), porque são conteúdo educativo sem nenhum dado pessoal. Escrita
continua só pelo SQL Editor. As tabelas antigas seguem como antes: RLS ligado
**sem** policy, acessíveis só pelas funções.

`select semear_problemas();` roda no fim do script e popula as 13 fases com
cerca de `qtd_questoes × 3` contas cada, já com historinha e ilustração. Rodar
de novo é seguro: só completa o que falta.

Novas funções RPC (todas `security definer`, `grant execute ... to anon`):

| função | usada em | o que faz |
|---|---|---|
| `listar_fases()` | catálogo público | lista as fases ativas por `ordem`, sem precisar de token |
| `obter_fase(fase_id)` | `js/conteudo.js` | devolve a fase + todos os problemas dela num `jsonb` |
| `listar_fases_progresso(token)` | `js/jogar.js` | a trilha com o **status** de cada fase: `bloqueada` / `liberada` / `concluida` |
| `sortear_problemas(fase_id, qtd, excluir[])` | `js/partida.js` | monta a rodada: dificuldade crescente, sem repetir problema e sem duas operações iguais seguidas |
| `fase_liberada(token, fase_id)` | conferência | se aquele avatar pode entrar naquela fase |

`fase_liberada_para(avatar, fase_id)` e `semear_problemas()` são internas
(sem grant para `anon`).

**Mudança importante em `salvar_resultado_fase`:** ela agora recusa gravar
progresso de fase bloqueada (`raise exception 'Fase bloqueada'`). A regra de
progressão passou a valer no back-end, não só no front — pular o menu do jogo
não libera mais nada. Todo o resto da função continua igual (mesmas validações,
mesmo `greatest(...)` no `on conflict`). Fase que não está na tabela `fases`
não é bloqueada, para quem rodou só o schema antigo continuar jogando.

**Se o banco já tem uma tabela `fases` antiga** (rascunho com `id` uuid, só
`ordem/nome/icone`): o script a renomeia para `fases_legado` — sem apagar
nada — e cria a `fases` nova com `id` inteiro, que é o que casa com
`progresso.fase`. Depois de conferir que nada usa a antiga (ex.: a função
`listar_fases_avatar`), dá pra apagar com `drop table fases_legado;`.

**Correção em `salvar_resultado_fase`:** o `on conflict (avatar_id, fase)`
dava erro de coluna ambígua (`fase` também é coluna de retorno), então o
progresso **nunca** era gravado no servidor — só no espelho local. Agora usa
`on conflict on constraint progresso_pkey`. Sem essa correção a fase 2 nunca
liberaria pelo servidor.

Como cadastrar conteúdo novo (fase, problema ou tema) está em
[CONTEUDO.md](CONTEUDO.md).

## O que ainda falta (fora do escopo)
- História 3.6 (recuperar PIN esquecido) — hoje só mostra um `alert()`.
  Dá pra plugar com uma função `redefinir_pin(...)` no mesmo padrão das
  outras.
- Limpeza periódica de `sessoes` expiradas: `iniciar_sessao` já apaga as
  vencidas a cada login; um cron do Supabase (`pg_cron`) faria isso de
  forma proativa, mas não é obrigatório.

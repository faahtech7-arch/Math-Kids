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

## O que ainda falta (fora do escopo)
- História 3.6 (recuperar PIN esquecido) — hoje só mostra um `alert()`.
  Dá pra plugar com uma função `redefinir_pin(...)` no mesmo padrão das
  outras.
- Limpeza periódica de `sessoes` expiradas: `iniciar_sessao` já apaga as
  vencidas a cada login; um cron do Supabase (`pg_cron`) faria isso de
  forma proativa, mas não é obrigatório.

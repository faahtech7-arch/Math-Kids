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

## Épico 4 — progresso, pontuação e recompensas

O `schema.sql` agora também cria o que a criança **ganha** ao terminar uma
fase. Antes o banco guardava estrelas e pontos do jeito que o navegador
mandava; agora quem calcula é o servidor.

**Já tem o banco instalado?** Rode o `schema.sql` inteiro de novo no SQL
Editor. É seguro (tudo é `if not exists` / `create or replace`) e a migração
do progresso antigo acontece sozinha, uma vez só. Enquanto você não rodar, o
jogo novo continua funcionando com o banco antigo — só que medalhas e
conquistas ficam guardadas apenas no dispositivo.

- **`progresso_avatar`** — substitui a `progresso`. Uma linha por
  `(avatar, fase)` com `concluida`, `estrelas`, `nivel_recompensa`
  (`bronze`/`prata`/`ouro`), `pontuacao`, `acertos`, `erros`, `tempo_gasto`,
  `melhor_combo`, `tentativas` e `data_conclusao`. Guarda sempre o melhor:
  o maior de estrelas/pontos/acertos/combo, o menor de erros/tempo, e a
  primeira data de conclusão.
- **`conquistas`** — o catálogo, com a regra de cada uma em duas colunas:
  `criterio_tipo` (qual métrica) e `criterio_valor` (quanto precisa valer).
  Já vem com 15 conquistas.
- **`conquistas_avatar`** — o que cada avatar desbloqueou e quando.

A tabela `progresso` antiga **não é apagada**: as linhas são copiadas para
`progresso_avatar` e marcadas com `migrado_e4`, para a cópia não se repetir.
Nada mais lê nem escreve nela.

Novas funções RPC (todas `security definer`, `grant execute ... to anon`):

| função | usada em | o que faz |
|---|---|---|
| `registrar_resultado_fase(token, fase_id, respostas, tempo_gasto)` | `js/partida.js` | recebe as respostas da partida, **refaz a conta** (pontos, estrelas, medalha), grava mantendo o melhor e devolve `{ partida, progresso, novas_conquistas }` |
| `consultar_progresso(token)` | histórico | resumo do avatar + a trilha fase a fase |
| `listar_conquistas(token)` | `js/galeria.js` | todas as conquistas ativas + o estado daquele avatar (com `valor_atual`, para o "3 de 5") |
| `painel_progresso(token)` | `progresso.html` | resumo + fases + conquistas numa chamada só |

`respostas` é uma lista com um objeto por questão, na ordem jogada:
`{ "t": tentativa em que acertou (0 = não acertou), "e": tentativas que não
deram certo, "r": décimos de segundo que sobravam no cronômetro }`.

As RPCs antigas continuam com o **mesmo nome e o mesmo formato de resposta**
(`carregar_progresso`, `listar_fases_progresso`, `salvar_resultado_fase`), só
que lendo e gravando em `progresso_avatar`. Duas mudanças de propósito em
`salvar_resultado_fase`: as estrelas passam a sair das metas da fase (o
`p_estrelas` enviado é ignorado) e os pontos são limitados ao máximo que a
partida poderia valer.

**A regra de pontuação** está em `pontos_do_acerto()`: base 100 / 60 / 30
conforme a tentativa, + 10 por acerto seguido (até +80), + até 40 de bônus
de tempo nas fases com cronômetro. Não existe parcela negativa: errar nunca
tira ponto. `js/pontuacao.js` faz a mesma conta no navegador — mudou a regra
num lugar, mude no outro (`node ferramentas/testar-recompensas.mjs` acusa se
os dois saírem de sincronia).

**O motor de conquistas** é `avaliar_conquistas()`: calcula as métricas do
avatar (`metricas_do_avatar()`) e desbloqueia toda conquista ativa em que
`metrica[criterio_tipo] >= criterio_valor`. Três gatilhos cuidam do resto:
todo progresso gravado reavalia o avatar; conquista cadastrada ou alterada
reavalia todo mundo; e `criterio_tipo` inexistente é recusado na hora. Como
cadastrar uma conquista nova está em [CONTEUDO.md](CONTEUDO.md).

**Segurança.** `progresso_avatar` e `conquistas_avatar` têm RLS ligado **sem
policy**, como `sessoes`: o jogo não usa o login do Supabase Auth (a criança
entra com avatar + PIN), então não existe `auth.uid()` para escrever uma
policy por linha. O isolamento por avatar é feito nas funções, que descobrem
o avatar pelo token da sessão. `conquistas` é catálogo, com leitura pública
como `fases`.

Um detalhe que este script passou a tratar: em projeto Supabase, função
criada em `public` já nasce executável por `anon`. Tirar o `execute` só de
`PUBLIC` não fecha a porta — por isso as funções internas agora têm
`revoke ... from public, anon, authenticated`. Isso importa em
`gravar_resultado()`, que recebe o avatar direto, sem token.

Para conferir depois de rodar, a última mensagem do script é
`--- Épico 4: 15 conquistas ativas, N linha(s) em progresso_avatar, ... ---`.

## Excluir avatar (sem PIN)

`excluir_avatar` mudou de assinatura: era `(avatar_id, pin)` e passou a ser
só `(avatar_id)`. A exclusão agora é um ✕ no cartão do avatar, com uma
confirmação na tela, e **não pede mais o PIN**. O `schema.sql` remove a
versão antiga (`drop function if exists excluir_avatar(uuid, text)`) antes
de criar a nova, então basta rodar o arquivo de novo.

Enquanto o banco estiver com a versão antiga, o front novo não consegue
excluir: a confirmação mostra *"O banco ainda não foi atualizado para
excluir sem PIN"* e nada é apagado.

O que a função faz não mudou: apaga progresso, medalhas, conquistas, sessões
e consentimento do avatar, devolve-o para a lista de disponíveis e apaga o
responsável que ficar sem nenhum avatar. Devolve `true` se excluiu e `false`
se o avatar já não estava ativo.

Sem o PIN não há mais nenhuma credencial protegendo a exclusão: qualquer
pessoa com acesso ao jogo consegue excluir qualquer avatar. Se isso deixar
de servir, o lugar de voltar a exigir uma credencial é dentro da própria
função (está comentado lá).

## O que ainda falta (fora do escopo)
- História 3.6 (recuperar PIN esquecido) — hoje só mostra um `alert()`.
  Dá pra plugar com uma função `redefinir_pin(...)` no mesmo padrão das
  outras.
- Limpeza periódica de `sessoes` expiradas: `iniciar_sessao` já apaga as
  vencidas a cada login; um cron do Supabase (`pg_cron`) faria isso de
  forma proativa, mas não é obrigatório.
- Fila de reenvio: partida jogada sem internet fica só no dispositivo. O
  servidor só recebe o resultado quando a fase for jogada de novo com rede.

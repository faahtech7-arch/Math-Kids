# 🧮 Math Kids

Jogo de matemática para crianças de **7 a 10 anos**: soma, subtração, multiplicação
e divisão em fases curtas, com login por **avatar + PIN**, progresso salvo na nuvem
e um mini-reconhecedor de dígitos desenhados à mão (a criança escreve a resposta
com o dedo na tela).

Site **100% estático** (HTML + CSS + JavaScript puro, sem build) com backend no
**Supabase**. Hospedado na **Vercel**.

---

## ✨ Como funciona

| Tela | Arquivo | O quê |
|---|---|---|
| **Quem vai jogar** | `index.html` + `js/script.js` | grade de avatares (vem do Supabase), teclado de PIN, e a "Área do responsável" (cadastro da criança + consentimento) |
| **Mapa de fases** | `jogar.html` + `js/jogar.js` | fases liberadas/bloqueadas, estrelas e melhor pontuação por fase |
| **Partida** | `partida.html` + `js/partida.js` | as contas da fase, vidas, cronômetro opcional e a lousa onde a criança **desenha o resultado** |

---

## 🎮 Épico 2 — Experiência de jogo e interação da criança

O jogo é feito para ser usado **sem ler instruções e sem digitar nada**: tudo
acontece por toque, e nenhuma mensagem culpa a criança pelo erro.

### 1. Menu de seleção de fases (`jogar.html`)
Cartões grandes com emoji, cor própria, estrelas conquistadas e recorde de pontos.
Fase bloqueada vira `div` com cadeado 🔒 (não é clicável nem focável); fase liberada
vira `<a>` com `tabIndex`, então dá pra navegar tudo pelo teclado também. No topo, o
avatar da criança e o placar de estrelas (`⭐ N/39`).

### 2. Interação por toque e desenho
Nenhum campo de texto na área da criança — só alvos visuais:

- **Escolher avatar / fase / tecla do PIN**: toque simples.
- **Escrever o número**: a criança arrasta o dedo (ou o mouse, ou a caneta) sobre o
  `<canvas>` de 300×300. O desenho usa **Pointer Events** (`pointerdown/move/up`),
  então dedo, mouse e stylus seguem o mesmo caminho, e `touch-action: none` impede
  que o gesto role a página no meio do traço.
- **Corrigir um dígito**: com resposta de 2 dígitos, tocar no quadradinho escolhe
  qual dos dois reescrever — o quadrado ativo fica destacado em azul.
- **Apagar / Conferir**: dois botões grandes; "Conferir" só liga quando já existe
  traço na tela.

**Duas formas de responder.** Os botões **✏️ Desenhar** / **🔢 Números** trocam a
lousa por um **teclado numérico na tela** (teclas de 56 px). É a saída para a criança
que ainda não desenha firme — num tablet não existe teclado físico, então sem isso
ela ficaria travada. A escolha fica salva em `localStorage`, então quem precisa do
teclado não reconfigura a cada fase. No modo teclado não há etapa de reconhecimento:
tocar no número já preenche o quadrado.

### 3. Verificação de resposta em 2 etapas
Um toque em "Conferir" **não** decide se a criança acertou. São dois momentos
separados (`conferir()` e `avaliar()` em [js/partida.js](js/partida.js)):

| Etapa | O que acontece | Pode perder vida? |
|---|---|---|
| **1. Ler o traço** | a MLP classifica o desenho. Canvas vazio → "Desenha um número primeiro 🙂". Palpite incerto (confiança < 0,60 ou margem < 0,14) → "Hmm, não deu pra ler. Capricha e escreve mais gordo!" | **Não** |
| **2. Conferir a conta** | só quando **todos** os quadrados estão preenchidos, a resposta montada é comparada com a certa | Sim |

(No modo teclado só existe a etapa 2 — não há traço pra interpretar.)

Isso separa "o computador não entendeu minha letra" de "eu errei a conta": falha de
reconhecimento nunca custa uma vida.

### 4. Feedback visual de acerto e erro
- **Acerto**: os quadrados ficam verdes (`.slot.certo`) e dão um **pulinho**
  (`@keyframes slotPop`), + `Boa! +N pontos`; o combo 🔥 aparece no HUD a partir de 2
  acertos seguidos, também com pop.
- **Erro**: quadrados em vermelho claro (`.slot.errado`) **tremendo** de leve
  (`@keyframes slotTremer`), e o chip de vidas balança ao perder um coração
  (`❤❤🤍`).
- **Sempre visível**: pontos, questão atual (`3/8`), barra de progresso e — nas fases
  cronometradas — a barra de tempo, que fica vermelha abaixo de 35%.
- Todas essas animações são desligadas em `prefers-reduced-motion: reduce`.

### 5. Feedback educativo, sem conteúdo negativo
Nenhuma mensagem usa "errado", "burro" ou emoji triste. Ao errar, a criança recebe
uma **dica gerada a partir da conta que está na tela** — não um texto fixo.
[js/dicas.js](js/dicas.js) segue três regras:

1. **nunca entrega a resposta final** — ensina o caminho;
2. **fica mais concreta a cada tentativa**: nível 1 = estratégia, nível 2 = um pedaço
   da conta já resolvido;
3. abre sempre com elogio (*"Quase!"*, *"Tá pertinho!"*) e sai em azul, não em
   vermelho (`.aviso.dica`) — é ensino, não bronca.

| Conta | 1º erro (estratégia) | 2º erro (mais concreto) |
|---|---|---|
| `14 + 8` | Quebra o 14 em 10 + 4. Faz 8 + 4 primeiro e depois junta o 10. | 8 + 4 = 12. Agora junta o 10 nesse número. |
| `65 − 37` | Tira de pouquinho: primeiro 65 − 30, e só depois tira os 7 que faltam. | 65 − 30 = 35. Agora tira 7 desse número. |
| `6 × 8` | 8 × 6 é o 8 somado 6 vezes: 8 + 8 + 8... | Se 8 × 3 = 24, é só dobrar esse resultado. |
| `27 ÷ 3` | Quantos 3 cabem em 27? Conta de 3 em 3: 3, 6, 9... | Pensa ao contrário: 3 × qual número dá 27? |
| `16 + 4 + 11` | Faz uma de cada vez, da esquerda pra direita. Começa só com 16 + 4. | 16 + 4 = 20. Agora falta só 20 + 11. |

Cada operação tem seu próprio raciocínio, incluindo os casos especiais (× 10 é "põe um
zero", × 5 é "metade de × 10", × 2 é "o dobro", dezena redonda em subtração vira
"pega uma dezena emprestada").

As outras mensagens seguem o mesmo tom:

- No começo de cada questão aparece a **dica da fase** (`fase.dica`), ex.:
  *"Multiplicação é soma repetida: 4×3 é 4+4+4."*
- Acabaram as tentativas: *"A resposta era 42. Bora pra próxima!"* — a resposta certa
  é **mostrada** nos quadrados antes de seguir, então errar também ensina.
- Tempo esgotado: *"Tempo! A resposta era 42."*
- Fim de fase com 0 estrelas: *"Fim da fase — quase lá!"* (nunca "você perdeu").

### 6. Acessibilidade e usabilidade infantil
- Alvos de toque de **44 px** (48 px em "Apagar"/"Conferir", 56 px no teclado
  numérico) e fontes grandes com `clamp()`.
- `:focus-visible` com contorno de 3 px em avatares, teclas, cartões e botões.
- `@media (prefers-reduced-motion: reduce)` desliga animações e transições.
- Mensagens de acerto/erro/dica em `role="status" aria-live="polite"` — leitor de
  tela anuncia o feedback; `aria-label` nos avatares, no botão ←, nas teclas do PIN,
  nas teclas do teclado numérico e na lousa.
- Os quadrados da resposta são `<button>` com `aria-label` ("Algarismo 1 de 2"), não
  `div` — focáveis por teclado e anunciados por leitor de tela.
- **Três formas de digitar**: desenhar, teclado na tela, ou teclado físico (`0–9`
  preenchem o quadrado ativo, `Backspace` apaga — apoio para o professor).
- Diálogos (PIN, área do responsável, fim de fase) com `role="dialog"` +
  `aria-modal`; ao fim da fase o foco vai para o título do cartão.
- Sair da fase pede confirmação, pra não perder a partida com um toque acidental.

---

## 📚 Épico 3 — Conteúdo pedagógico e gestão de fases

Até aqui o jogo carregava as fases de um arquivo JavaScript e sorteava as
contas no próprio navegador. O Épico 3 inverte isso: **o conteúdo mora no
Supabase**. Quem escreve matemática (o time pedagógico) passa a trabalhar no
banco, e quem escreve código não precisa ser chamado para cada conta nova.

O gerador local não foi jogado fora — ele virou o **plano B**. Se o banco não
responder, [js/conteudo.js](js/conteudo.js) cai em `fases.js` + `gerador.js` e
a criança não percebe diferença nenhuma.

### 1. A API de fases e questões

Três tabelas novas em [supabase/schema.sql](supabase/schema.sql):

| Tabela | Guarda | Destaque |
|---|---|---|
| `fases` | a trilha (nome, ícone, cor, metas) | `ordem` única e **sem furos** — é ela que encadeia a liberação |
| `problemas` | o acervo de contas de cada fase | `dados` em jsonb: **um formato só** para `+`, `−`, `×` e `÷` |
| `contextos` | 34 temas do dia a dia | modelos de frase com `{a}` e `{b}` |

O segredo do "schema genérico" é o campo `dados`:

```json
{ "partes": [14, "+", 8], "operandos": [14, 8],
  "operadores": ["+"], "expressao": "14 + 8 =" }
```

`partes` intercala número e operador, então `[3,"+",5,"-",2]` descreve um trio
com a mesma estrutura de `[14,"+",8]`. Uma operação nova entraria sem alterar
nenhuma coluna. E `partes` é o mesmo formato que [js/dicas.js](js/dicas.js) já
consumia — por isso as dicas educativas do Épico 2 continuam funcionando com
contas vindas do banco.

Quatro RPCs servem esse conteúdo: `listar_fases()`, `obter_fase(fase_id)`,
`listar_fases_progresso(token)` e `sortear_problemas(fase_id, qtd, excluir[])`.
As tabelas têm **RLS com leitura pública** — conteúdo educativo não tem dado
pessoal, e o que protege é não haver policy de escrita.

**Cadastrar uma conta nova não exige deploy.** Um `insert` no SQL Editor já
aparece na próxima partida, porque o front busca o conteúdo a cada fase.
O passo a passo está em [supabase/CONTEUDO.md](supabase/CONTEUDO.md).

**Dado torto nunca quebra a tela.** `normalizarProblema()` confere cada linha
que chega — inclusive **refazendo a conta** para ver se `resposta_correta`
bate — e descarta o que não passar, completando a rodada com o gerador local.
Fase sem nenhum problema cadastrado também funciona: vira 100% local.

### 2. Progressão sequencial validada no servidor

Antes, quem decidia se a fase estava liberada era o navegador. Agora a regra
vive no Postgres:

- a fase de `ordem = 1` está sempre aberta;
- a de `ordem = N+1` abre quando a de `ordem = N` foi **concluída** (≥ 1 estrela);
- `listar_fases_progresso` devolve o `status` de cada fase já calculado:
  `bloqueada`, `liberada` ou `concluida`;
- **`salvar_resultado_fase` recusa** gravar numa fase bloqueada
  (`raise exception 'Fase bloqueada'`).

Esse último item é a diferença que importa: abrir `partida.html?fase=9` na mão,
pulando o menu, não adianta mais — a partida até roda, mas o servidor não
registra o resultado. O bloqueio no front ([js/jogar.js](js/jogar.js) monta
fase bloqueada como `<div>` sem `href` e sem `tabIndex`) passou a ser
redundância de usabilidade, não a trava de verdade.

O cartão de cada fase mostra o status em texto (`Concluída ✔` / `Liberada` /
`Bloqueada 🔒`), e a fase bloqueada diz no `aria-label` **qual** fase precisa
ser concluída antes. Ao voltar da partida, o menu refaz a consulta no evento
`pageshow` — a fase recém-liberada aparece aberta na hora, sem recarregar.

### 3. Problemas adequados à idade

Cada problema tem uma **historinha do dia a dia** e uma **ilustração**:

> 🍎 *Ana colheu 14 maçãs no sítio e ganhou mais 8 da vovó. Com quantas maçãs
> ela ficou?*
>
> **14 + 8 =**

O enunciado dá sentido à conta; a conta continua embaixo, porque é ela que a
criança resolve. Os textos saem de `contextos` — 34 temas concretos (frutas,
figurinhas, brinquedos, festa, bichinhos, lanche, escola) distribuídos pelas
quatro operações. Cada fase recebe cerca de `qtd_questoes × 3` problemas, o
suficiente para três partidas sem ver a mesma conta.

A ordem em que os problemas aparecem não é sorteio puro. `sortear_problemas()`
no banco e `criarFonteDeProblemas()` no navegador garantem, juntos:

| Regra | Por quê |
|---|---|
| dificuldade crescente dentro da rodada | a criança entra no ritmo antes de apertar |
| nunca o mesmo problema duas vezes | decorar a resposta não é aprender |
| nunca duas operações iguais seguidas | numa fase mista, alternar obriga a ler o sinal |
| a rodada anterior entra em `p_excluir` | jogar de novo traz contas diferentes |
| toda questão tem ilustração | sem emoji cadastrado, entra um padrão da operação |

Se o acervo acabar no meio da rodada, a fonte completa com o gerador local em
vez de repetir — a partida nunca fica mais curta.

### Testes

```bash
node ferramentas/testar-conteudo.mjs   # 665 verificações da camada de conteúdo
node ferramentas/testar-dicas.mjs      # 9280 dicas do Épico 2 (regressão)
```

O primeiro roda **sem rede**: como o Supabase é importado dinamicamente, em
Node toda RPC falha de propósito e o que fica exercitado é justamente o
caminho de fallback. Ele confere as 4 operações, 14 formatos de dado
malformado, a não-repetição, o top-up local e que as 13 fases continuam
jogáveis offline.

---

## 🏆 Pontuação, estrelas e progressão

**Pontos por acerto** (`pontosDoAcerto()`):

```
base    = 100 (de primeira) | 60 (2ª tentativa) | 30 (3ª) | 20
+ combo = 10 × combo, limitado a 8 (máx. +80)
+ tempo = só em fase cronometrada: (tempo restante / tempo total) × 40
```

**Estrelas** ao fim da fase, pela razão `acertos / total`:

| | 1 ★ | 2 ★ | 3 ★ |
|---|---|---|---|
| Fases 1–10 | 60% | 80% | 100% |
| Fases extras | 60% | 80% | 90% |

**Liberação**: a fase 1 está sempre aberta e a fase N+1 abre quando a fase N tem
**≥ 1 estrela**. Desde o Épico 3 quem aplica essa regra é o **Postgres**
(`fase_liberada_para`, e `salvar_resultado_fase` recusa fase bloqueada);
`faseLiberada()` em [js/fases.js](js/fases.js) só vale no modo offline.
São 13 fases × 3 = **39 estrelas** — número que agora vem da contagem de fases
cadastradas, não de uma constante no código.

O progresso guarda sempre o **melhor** desempenho de cada fase — repetir uma fase
nunca piora o recorde.

---

## 🔐 Login, sessão e dados

- O PIN (4 dígitos) **nunca** trafega em claro nem é comparado no navegador: o hash
  (`crypt`/bcrypt) roda dentro do Postgres, nas funções RPC do Supabase.
- O login devolve um **token de sessão opaco** (18 bytes aleatórios em hex, expira em
  12 h), guardado só no `sessionStorage`. Todo salvamento de progresso exige o token.
- RLS ligado em todas as tabelas **sem policies**: a chave pública só consegue
  *executar* as funções RPC, nunca ler/escrever direto nas tabelas.
- A criança nunca digita texto livre — escolhe um avatar pré-cadastrado. Nome e
  contato ficam no cadastro do **responsável**, junto do consentimento (que nunca vem
  marcado por padrão).

**Progresso funciona offline.** [js/progresso.js](js/progresso.js) grava sempre num
espelho em `localStorage` (uma "gaveta" por avatar) antes de tentar o Supabase. Se o
backend não responder — sem internet, schema ainda não instalado, sessão expirada — o
jogo continua liberando fases normalmente e a tela de fim mostra *"Progresso salvo
neste dispositivo ✔"*. Na próxima carga com rede, os dois lados são mesclados
mantendo o melhor de cada campo.

---

## 🧩 Fases e geração das contas

Desde o Épico 3 a fonte das contas é o **Supabase** (tabela `problemas`), e
[js/fases.js](js/fases.js) + [js/gerador.js](js/gerador.js) viraram o **plano
B** para quando o banco não responde. As garantias valem nos dois caminhos — o
gerador local as aplica na hora; o banco as impõe por `check` e pelo validador
de [js/conteudo.js](js/conteudo.js), que refaz a conta antes de aceitar:

- subtração **nunca** negativa;
- divisão **sempre** exata (resto 0);
- resposta entre **0 e 99** (no máximo 2 quadrados);
- sem conta repetida dentro da mesma fase.

São 10 fases iniciais (`id: 1..10`, de "Primeiras somas" ao "Desafio final") mais 3
extras (`id: 101..103`), duas delas cronometradas (10 s e 12 s por conta). As
mesmas 13 estão semeadas na tabela `fases` com `ordem` 1..13 — cadastrar a 14ª
no banco a faz aparecer no mapa sem tocar em código.

---

## ✍️ Reconhecimento de dígitos

[js/reconhecimento.js](js/reconhecimento.js) roda uma MLP `784 → 128 → 10` **em
JavaScript puro**, com os pesos quantizados em int8 dentro de `js/modelo-mnist.json`
(~135 KB, sem TensorFlow.js nem WASM). O pré-processamento segue a convenção do
MNIST: recorta o traço, redimensiona pra caber numa caixa de 20 px, centraliza numa
tela 28×28 pelo centro de massa e suaviza com um blur 3×3.

O modelo é treinado offline pelos scripts em `ferramentas/` (ver abaixo).

---

## 🗂️ Estrutura

```
math-kids/
├── index.html, jogar.html, partida.html   páginas do jogo
├── css/
│   ├── style.css                          base / telas de menu
│   └── jogo.css                           mapa de fases + tela de partida
├── js/
│   ├── script.js                          tela inicial (avatares, PIN, cadastro)
│   ├── jogar.js                           mapa de fases
│   ├── partida.js                         loop de uma partida
│   ├── conteudo.js                        fases e problemas do banco (+ fallback)
│   ├── fases.js / gerador.js              plano B: fases e contas feitas no navegador
│   ├── dicas.js                           dicas educativas geradas a partir da conta
│   ├── creditos.js                        time do projeto + tela de créditos
│   ├── avatares.js                        SVGs dos rostos dos avatares
│   ├── progresso.js                       progresso na nuvem + espelho offline
│   ├── sessao.js                          token de sessão (sessionStorage)
│   ├── reconhecimento.js                  inferência da MLP (JS puro)
│   ├── modelo-mnist.json                  pesos int8 do modelo (gerado)
│   └── supabaseClient.js / config.js      cliente Supabase + credenciais
├── img/
│   └── (logo da universidade — ver img/LEIA-ME.md)
├── supabase/
│   ├── schema.sql                         tabelas + funções RPC (rodar no SQL Editor)
│   ├── CONTEUDO.md                        como cadastrar fases/problemas novos
│   └── LEIA-ME.md                         passo a passo da integração
├── ferramentas/                           treino do modelo + testes — NÃO vão pro deploy
│   ├── testar-conteudo.mjs                camada de conteúdo (Épico 3)
│   └── testar-dicas.mjs                   dicas educativas (Épico 2)
├── vercel.json                            headers de cache
└── .vercelignore                          o que fica de fora do deploy
```

---

## 🚀 Rodar localmente

Precisa servir por HTTP (os `import` de ES modules não funcionam via `file://`).

```bash
# a partir da pasta math-kids/
npx serve .
# ou, com Python:  python -m http.server 5500
```

Abra `http://localhost:3000` (ou a porta indicada). No VS Code, a extensão
**Live Server** também serve.

> Sem configurar o Supabase o app **abre**, mas a grade de avatares fica vazia (os
> avatares vêm de `listar_avatares_ativos`). Depois de logar, o jogo inteiro continua
> funcionando mesmo se o backend cair.

---

## 🔌 Configurar o Supabase

Passo a passo completo em [supabase/LEIA-ME.md](supabase/LEIA-ME.md). Resumo:

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **SQL Editor** → cole `supabase/schema.sql` → execute (cria tabelas, popula os
   avatares e cria as funções RPC). Re-executar é seguro (`if not exists` /
   `create or replace`).
3. *Project Settings → API*: copie a **Project URL** e a **anon/publishable key**.
4. Preencha [js/config.js](js/config.js) com esses dois valores.

Não precisa de variável de ambiente, CORS nem redirect URL — o app usa só
`supabase.rpc(...)`. A anon key é pública por natureza (vai no bundle do navegador);
a proteção real é o RLS sem policies + os `grant execute` restritos do `schema.sql`.

**RPCs liberadas para o `anon`:** `listar_avatares_ativos`,
`listar_avatares_disponiveis`, `login_avatar`, `cadastrar_responsavel`,
`iniciar_sessao`, `carregar_progresso`, `salvar_resultado_fase`, `encerrar_sessao`
e, do Épico 3, `listar_fases`, `obter_fase`, `listar_fases_progresso`,
`sortear_problemas`, `fase_liberada`.

---

## 🧠 Re-treinar o modelo de dígitos

```bash
cd ferramentas
python -m pip install numpy
python treinar_modelo.py        # baixa o MNIST (~11 MB) p/ .cache/ e gera js/modelo-mnist.json
python gerar_amostras_teste.py  # opcional: gera amostras-teste.json p/ testar-reconhecimento.html
```

`ferramentas/testar-reconhecimento.html` mede a taxa de acerto no próprio
navegador (critério de aceite: ≥ 80%; o modelo atual fica em ~97–98%).

---

## ☁️ Deploy na Vercel

Site estático, sem build. **Root Directory** = esta pasta (a que tem
`index.html` + `vercel.json`); Framework Preset = **Other**; sem Build Command.

```bash
npm i -g vercel
vercel          # primeiro deploy (cria o projeto)
vercel --prod   # publica em produção
```

`vercel.json` define o cache (modelo imutável por 1 ano; JS/CSS revalidados a cada
deploy; HTML sem cache). `.vercelignore` mantém `ferramentas/` e `supabase/` fora
do site publicado.

---

## 👥 Épico 5 — Créditos e autoria

Trabalho acadêmico da **Universidade Cruzeiro do Sul**. O time tem 9 integrantes:

| Papel | Integrantes |
|---|---|
| 🎯 Product Owner | Davi Lima |
| 🌀 Scrum Master | Gabriel Maganha |
| 🔍 QA | Arthur Mendonça |
| 🎨 Front-end | Victor Lima · Arthur Brandão |
| ⚙️ Back-end | Bruno Empstein · Pedro Matos · Luan Silva · Vini Cremonezi |

Os créditos também aparecem **dentro do jogo**: botão **Créditos** na tela inicial,
ao lado de "Área do responsável" — fora do caminho da criança, mas fácil de achar na
apresentação do trabalho. Fecha no ✕, clicando fora ou com `Esc`.

### Logo da universidade

Salve o arquivo oficial da logo em `img/` com um destes nomes — `creditos.js` testa
nesta ordem e usa o primeiro que encontrar:

```
img/cruzeiro-do-sul.svg      ← melhor (não borra no projetor)
img/cruzeiro-do-sul.png      ← segunda opção (fundo transparente)
img/cruzeiro-do-sul.jpg
```

Não precisa mexer em código: assim que o arquivo existir, a logo substitui o nome em
texto e "Projeto acadêmico" vira a legenda embaixo. Sem o arquivo, a tela mostra o
nome em texto e continua funcionando — **nunca aparece ícone de imagem quebrada**,
porque a troca só acontece depois que a imagem carrega de verdade.

A lista fica em [js/creditos.js](js/creditos.js) e é a **fonte única** da autoria:
quem entrar ou sair do grupo se ajusta só naquele arquivo, e a tela se remonta
sozinha. Esta tabela do README é a mesma informação em formato de leitura.

---

## ⚠️ Limitações conhecidas

- **PIN de 4 dígitos sem rate-limit no servidor** — força bruta online é viável; o
  alvo é uso escolar de baixo risco (as RPCs não expõem dados pessoais).
- **`supabase-js` carregado de `esm.sh`**, pinado só na major (`@2`) — rede que
  bloqueia CDNs (comum em escolas) derruba o login. Ideal: vendorizar a lib e pinar
  a versão exata.
- **Recuperar PIN esquecido** (história 3.6): hoje só mostra um `alert()` descrevendo
  o fluxo; falta a RPC `redefinir_pin`.
- **Sem áudio** — todo o feedback é visual/textual; leitura em voz alta das contas
  ajudaria quem ainda não lê bem.

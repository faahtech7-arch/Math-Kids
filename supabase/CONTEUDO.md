# Cadastrar fases, problemas e conquistas — Math Kids

Guia para quem vai **criar conteúdo novo** no banco: uma conta nova, um tema
novo, uma fase inteira, uma conquista. Não é preciso saber como o jogo foi
feito, e **não é preciso mexer no front-end nem fazer deploy** — o site lê
tudo do Supabase.

Tudo acontece no **SQL Editor** do projeto Supabase (menu lateral → SQL Editor
→ New query → colar → Run).

---

## As três tabelas

| Tabela | O que guarda |
|---|---|
| `fases` | a trilha do jogo: nome, emoji, cor, dificuldade e a **ordem** em que as fases liberam |
| `problemas` | o acervo de contas de cada fase, já com a historinha e a ilustração |
| `contextos` | o banco de temas do dia a dia (modelos de frase) usado para gerar historinhas |

O jogo sorteia, a cada partida, um punhado de `problemas` da fase escolhida.
Por isso cada fase precisa de **acervo de sobra**: o alvo é `qtd_questoes × 3`,
para a criança não ver as mesmas contas duas partidas seguidas.

---

## `problemas` — campo a campo

| Campo | Obrigatório | O que é |
|---|---|---|
| `fase_id` | sim | o `id` da fase (1 a 10 normais, 101 a 103 extras) |
| `tipo_operacao` | sim | `+`, `-`, `*`, `/` ou `misto` (3 parcelas) |
| `dados` | sim | a conta em si, em JSON — ver abaixo |
| `resposta_correta` | sim | número inteiro de **0 a 99** |
| `elementos_visuais` | sim | `{ emoji, tema, cor, alt }` — a ilustração |
| `enunciado` | não | a historinha. Sem ela, o jogo mostra só a conta |
| `tema` | não | rótulo do assunto (`frutas`, `festa`…) |
| `dificuldade` | não | 1 a 5, para a rodada ir do fácil ao difícil (padrão 1) |
| `ordem` | não | desempate dentro da mesma dificuldade |
| `ativo` | não | `false` tira o problema do jogo sem apagá-lo |

### O formato de `dados`

É o mesmo para as quatro operações — é isso que permite servir tudo pela
mesma API:

```json
{
  "partes":     [14, "+", 8],
  "operandos":  [14, 8],
  "operadores": ["+"],
  "expressao":  "14 + 8 ="
}
```

- **`partes`** é o campo que o jogo realmente usa. Intercala número, operador,
  número. O operador vai em **ASCII** (`+ - * /`), nunca `×` ou `÷`.
- **`expressao`** é só o texto que aparece na tela — aí sim com sinal bonito
  (`14 + 8 =`, `65 − 37 =`, `6 × 8 =`, `27 ÷ 3 =`) e terminando em `=`.
- Conta de três parcelas: `"partes": [3, "+", 5, "-", 2]`, resposta `6`
  (resolve-se da **esquerda para a direita**, como a criança faz).

---

## Exemplos prontos (um por operação)

Copie, troque os números e rode.

```sql
-- ➕ SOMA
insert into problemas (fase_id, tipo_operacao, dados, resposta_correta,
                       elementos_visuais, enunciado, tema, dificuldade)
values (1, '+',
  '{"partes":[14,"+",8],"operandos":[14,8],"operadores":["+"],"expressao":"14 + 8 ="}'::jsonb,
  22,
  '{"emoji":"🍎","tema":"frutas","cor":"#FF6F91","alt":"maçãs"}'::jsonb,
  'Ana colheu 14 maçãs no sítio e ganhou mais 8 da vovó. Com quantas maçãs ela ficou?',
  'frutas', 2);

-- ➖ SUBTRAÇÃO (nunca pode dar negativo)
insert into problemas (fase_id, tipo_operacao, dados, resposta_correta,
                       elementos_visuais, enunciado, tema, dificuldade)
values (2, '-',
  '{"partes":[20,"-",8],"operandos":[20,8],"operadores":["-"],"expressao":"20 − 8 ="}'::jsonb,
  12,
  '{"emoji":"🍌","tema":"frutas","cor":"#FFD23F","alt":"bananas"}'::jsonb,
  'Gael tinha 20 bananas e comeu 8 no lanche. Quantas bananas sobraram?',
  'frutas', 1);

-- ✖️ MULTIPLICAÇÃO
insert into problemas (fase_id, tipo_operacao, dados, resposta_correta,
                       elementos_visuais, enunciado, tema, dificuldade)
values (6, '*',
  '{"partes":[6,"*",7],"operandos":[6,7],"operadores":["*"],"expressao":"6 × 7 ="}'::jsonb,
  42,
  '{"emoji":"🧁","tema":"lanche","cor":"#FF9A3D","alt":"cupcakes"}'::jsonb,
  'A confeitaria fez 6 caixas com 7 cupcakes cada. Quantos cupcakes foram feitos?',
  'lanche', 3);

-- ➗ DIVISÃO (tem que ser exata — resto 0)
insert into problemas (fase_id, tipo_operacao, dados, resposta_correta,
                       elementos_visuais, enunciado, tema, dificuldade)
values (8, '/',
  '{"partes":[42,"/",6],"operandos":[42,6],"operadores":["/"],"expressao":"42 ÷ 6 ="}'::jsonb,
  7,
  '{"emoji":"🍪","tema":"lanche","cor":"#FF9A3D","alt":"biscoitos"}'::jsonb,
  'Sofi vai repartir 42 biscoitos igualmente entre 6 amigos. Quantos biscoitos cada um recebe?',
  'lanche', 3);
```

---

## Cadastrar um **tema** novo (vale para muitos problemas)

Mais econômico que cadastrar problema a problema: o gerador
`semear_problemas()` usa os temas para escrever as historinhas sozinho.
`{a}` e `{b}` são trocados pelos números da conta.

```sql
insert into contextos (operacao, tema, emoji, objeto, cor, template) values
  ('+', 'horta', '🥕', 'cenouras', '#FF9A3D',
   'Théo colheu {a} cenouras na horta e a vizinha deu mais {b}. Com quantas cenouras ele ficou?');

select semear_problemas();   -- gera problemas novos usando o tema recém-criado
```

Cuidados com o template:

- a frase precisa fazer sentido **para qualquer número** de 0 a 99 (evite
  "o {a} irmão"), e o plural precisa funcionar (`{a} cenouras` serve para 1 e
  para 40 — não escreva "1 cenoura");
- **nunca** coloque `{r}` (a resposta) na pergunta — entregaria o resultado;
- já existem 34 temas cadastrados (7 por operação + 6 para `misto`).

---

## Cadastrar uma **fase** nova

Duas regras que, se quebradas, travam a progressão:

1. **`ordem` não pode ter furo.** As fases liberam em cadeia — a de ordem N+1
   abre quando a de ordem N é concluída. Se você cadastrar `ordem = 15` com a
   14 faltando, ninguém nunca chega na 15. Hoje a trilha vai de 1 a 13.
2. **`id` é o código usado na tabela `progresso_avatar`.** Use 1–10 para
   fases normais e 101+ para extras, como já está.

```sql
insert into fases (id, ordem, nome, icone, cor, operacao_principal, dificuldade,
                   dica, qtd_questoes, tentativas, tempo_seg,
                   meta_uma, meta_duas, meta_tres, extra, regras)
values (104, 14, 'Desafio da horta', '🥕', '#FF9A3D', 'misto', 5,
        'Todas as operações misturadas. Vai com calma!',
        10, 3, 0, 0.6, 0.8, 0.9, true,
        '{"operacoes":["+","-"],"parcelas":2,
          "+":{"aMin":10,"aMax":55,"bMin":6,"bMax":40,"somaMax":99},
          "-":{"minMax":90,"subMin":6,"subMax":45}}'::jsonb);

select semear_problemas();   -- popula a fase nova com o acervo
```

O campo `regras` é o que o jogo usa como **plano B**: se o banco ficar fora do
ar, o navegador gera contas com esses mesmos parâmetros. Vale a pena preencher.

As metas `meta_uma` / `meta_duas` / `meta_tres` decidem as estrelas **e a
medalha** da fase (bronze / prata / ouro): é o aproveitamento mínimo para cada
uma. `0.6, 0.8, 1.0` quer dizer 60% dos acertos para o bronze e 100% para o
ouro.

---

## Cadastrar uma **conquista** nova

Conquista é uma linha da tabela `conquistas`. A regra de desbloqueio vai em
duas colunas — **qual número** olhar e **quanto** ele precisa valer — e o jogo
faz o resto: avalia a cada fase concluída, mostra na Galeria de Conquistas e
avisa a criança na tela de fim de fase.

| Campo | Obrigatório | O que é |
|---|---|---|
| `codigo` | sim | apelido único, sem espaço nem acento (`trio_de_fases`). Não mude depois de criado |
| `nome` | sim | o título que a criança lê |
| `descricao` | sim | uma frase lúdica. É ela que ensina como ganhar, então diga o que precisa ser feito |
| `icone` | sim | um emoji |
| `cor` | não | cor de fundo do ícone, em hex (padrão `#FFD400`) |
| `criterio_tipo` | sim | qual número do avatar a regra olha — ver a lista abaixo |
| `criterio_valor` | sim | quanto esse número precisa valer (maior que zero) |
| `ordem` | não | posição na galeria |
| `ativo` | não | `false` esconde a conquista sem apagá-la |

### Os números que uma regra pode olhar (`criterio_tipo`)

| `criterio_tipo` | Conta o quê |
|---|---|
| `fases_concluidas` | fases com 1 estrela ou mais |
| `fases_principais_concluidas` | idem, só as da trilha principal |
| `fases_extras_concluidas` | idem, só as fases extras |
| `fases_cronometradas_concluidas` | idem, só as que têm cronômetro |
| `percentual_concluido` | de 0 a 100: quanto da trilha inteira já foi concluído |
| `estrelas_total` | soma das estrelas de todas as fases |
| `pontos_total` | soma da melhor pontuação de cada fase |
| `medalhas_ouro` | fases com medalha de ouro |
| `medalhas_prata` | fases com medalha de prata **ou** de ouro |
| `fases_perfeitas` | fases concluídas acertando todas de primeira |
| `melhor_combo` | a maior sequência de acertos numa mesma fase |
| `partidas_jogadas` | partidas terminadas, contando as repetições |

A conquista desbloqueia quando o número é **maior ou igual** ao
`criterio_valor`.

### Exemplos prontos

```sql
-- três fases concluídas
insert into conquistas (codigo, nome, descricao, icone, cor, criterio_tipo, criterio_valor, ordem)
values ('trio_de_fases', 'Trio de fases',
        'Três fases concluídas. Já virou rotina!',
        '🎈', '#4CC9F0', 'fases_concluidas', 3, 16);

-- dez mil pontos somados
insert into conquistas (codigo, nome, descricao, icone, cor, criterio_tipo, criterio_valor, ordem)
values ('dez_mil', 'Dez mil!',
        'Dez mil pontos somados. Que placar gigante!',
        '🚀', '#FF9A3D', 'pontos_total', 10000, 17);

-- todas as fases principais no ouro
insert into conquistas (codigo, nome, descricao, icone, cor, criterio_tipo, criterio_valor, ordem)
values ('tudo_dourado', 'Tudo dourado',
        'Dez medalhas de ouro. A trilha inteira brilhando!',
        '✨', '#FFD400', 'medalhas_ouro', 10, 18);
```

### O que acontece ao salvar

- **Quem já cumpria a regra ganha na hora.** Cadastrou "três fases
  concluídas" e a criança já tinha cinco? A conquista aparece desbloqueada na
  próxima vez que ela abrir a galeria.
- **`criterio_tipo` errado é recusado.** Um erro de digitação
  (`fases_concluida`) faz o `insert` falhar com a lista dos nomes válidos —
  melhor do que criar uma conquista que nunca desbloqueia.
- **Conquista ganha é para sempre.** Dá para ajustar a regra depois
  (`update conquistas set criterio_valor = 5 where codigo = '...'`): baixar o
  alvo desbloqueia para mais gente; subir o alvo **não tira** de quem já
  ganhou.
- **Para tirar do jogo**, prefira `update conquistas set ativo = false` a
  apagar: apagar remove também o registro de quem já tinha ganhado.

O navegador guarda uma cópia das 15 conquistas originais para funcionar sem
internet (`CONQUISTAS_PADRAO` em `js/recompensas.js`). Conquista cadastrada só
no banco aparece normalmente com rede; para ela existir também offline, copie
a linha para lá.

---

## Conferir que apareceu (sem deploy)

```sql
-- quantos problemas cada fase tem hoje
select f.ordem, f.id, f.nome, f.qtd_questoes,
       count(p.id) filter (where p.ativo) as problemas
from fases f
left join problemas p on p.fase_id = f.id
group by f.ordem, f.id, f.nome, f.qtd_questoes
order by f.ordem;

-- espiar uma rodada como o jogo veria
select dados ->> 'expressao' as conta, resposta_correta, enunciado,
       elementos_visuais ->> 'emoji' as ilustracao
from sortear_problemas(1, 8);

-- as conquistas e quantos avatares já ganharam cada uma
select c.ordem, c.codigo, c.nome, c.criterio_tipo, c.criterio_valor, c.ativo,
       count(ca.avatar_id) as avatares_que_ganharam
from conquistas c
left join conquistas_avatar ca on ca.conquista_id = c.id
group by c.id
order by c.ordem;
```

Depois é só **abrir o jogo e entrar na fase** (recarregando a página, sem
publicar nada). O conteúdo é buscado a cada partida.

---

## Erros comuns e o que o jogo faz com eles

O front-end **nunca quebra** por causa de um dado torto: ele descarta o
problema ruim, registra um aviso no console e completa a rodada com o gerador
local. A criança não vê erro nenhum. Mas o problema descartado simplesmente
não aparece — então vale conferir:

| Erro | O que acontece | Como evitar |
|---|---|---|
| `resposta_correta` não bate com `partes` | problema descartado em silêncio | confira a conta antes de inserir |
| divisão com resto (`7 ÷ 2`) | descartado | use só divisões exatas |
| resposta acima de 99 ou negativa | o banco **recusa** o insert (`check`) | a resposta cabe em 2 quadradinhos |
| operador `×` ou `÷` dentro de `partes` | descartado | em `partes` use `*` e `/`; o sinal bonito vai em `expressao` |
| `elementos_visuais` sem `emoji` | o jogo põe um emoji padrão da operação | preencha para ficar mais bonito |
| `enunciado` vazio | a faixa da historinha some, a conta continua | opcional, mas some com a graça |
| expressão repetida na mesma fase | o banco recusa (índice único) | varie os números |

Para achar o que foi descartado, abra o jogo, aperte **F12 → Console** e
procure as linhas começando com `Conteúdo:`.

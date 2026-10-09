/*
  =========================================================================
  Math Kids — Teste de pontuação, medalhas e conquistas — Épico 4
  =========================================================================
  Roda no Node, SEM rede e SEM npm install, igual aos outros testes desta
  pasta. Exercita js/pontuacao.js e js/recompensas.js, que não dependem de
  tela nem de banco, e confere se eles continuam sendo um ESPELHO fiel do
  que mora em supabase/schema.sql (o arquivo é lido e comparado aqui).

  O que é verificado:
    1. 6.1  acerto soma, erro NUNCA subtrai; a conta do navegador dá o mesmo
            número que a fórmula do banco, em todos os casos possíveis
    2. 6.1  o placar ao vivo da partida bate com a conta refeita no fim
    3. 6.2  estrelas e medalha saem do mesmo critério e nunca se contradizem
    4. 6.3  jogar de novo nunca piora o que está guardado
    5. 6.4  o motor de conquistas é genérico (regra é dado, não código) e o
            catálogo de reserva é igual ao seed do banco
    6. 6.5 / 6.7  o painel "Meu progresso" sai coerente, com ou sem banco
    7. dado torto vindo do banco nunca lança exceção

  Uso:
      cd ferramentas
      node testar-recompensas.mjs

  Sai com código 1 se achar qualquer falha (dá pra usar em CI).
  =========================================================================
*/
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  REGRA_PONTUACAO,
  pontosDoAcerto,
  decimosRestantes,
  pontuacaoMaxima,
  calcularPartida,
  calcularEstrelas,
  acertosParaEstrelas,
  melhorDaFase,
  mesclarMapas,
  linhaDaPartida,
} from "../js/pontuacao.js";
import {
  NIVEIS,
  ORDEM_DOS_NIVEIS,
  CONQUISTAS_PADRAO,
  TIPOS_DE_CRITERIO,
  nivelDaRecompensa,
  nivelValido,
  medalhaSVG,
  calcularMetricas,
  conquistasMerecidas,
  montarConquistas,
  normalizarConquista,
  normalizarConquistas,
  normalizarPainel,
  normalizarResultado,
  montarPainelLocal,
  montarResumo,
  fracaoDaConquista,
  textoDoProgresso,
  proximoObjetivo,
  formatarPontos,
} from "../js/recompensas.js";
import { listarFasesComStatus } from "../js/conteudo.js";
import { TODAS_FASES } from "../js/fases.js";

let falhas = 0;
let checados = 0;

function ok(condicao, titulo, detalhe) {
  checados++;
  if (condicao) return true;
  falhas++;
  console.log(`[!] ${titulo}`);
  if (detalhe !== undefined) console.log(`    ${detalhe}`);
  return false;
}

function secao(t) {
  console.log(`\n--- ${t} ---`);
}

function naoLanca(titulo, fn) {
  try {
    fn();
    checados++;
    return true;
  } catch (e) {
    return ok(false, `${titulo} LANÇOU exceção`, e?.message);
  }
}

const SCHEMA = fs.readFileSync(
  fileURLToPath(new URL("../supabase/schema.sql", import.meta.url)), "utf8");

/* Gerador com semente: se um caso aleatório falhar, ele falha de novo na
   próxima execução — dá para investigar. */
let semente = 20261008;
function sorteio() {
  semente = (semente * 1103515245 + 12345) & 0x7fffffff;
  return semente / 0x7fffffff;
}
function inteiroEntre(min, max) {
  return min + Math.floor(sorteio() * (max - min + 1));
}

/* Uma partida inventada, no formato que js/partida.js registra. */
function partidaAleatoria(fase) {
  const respostas = [];
  for (let i = 0; i < fase.qtdQuestoes; i++) {
    const acertou = sorteio() < 0.75;
    if (acertou) {
      const t = inteiroEntre(1, fase.tentativas);
      respostas.push({ t, e: t - 1, r: fase.tempo > 0 ? inteiroEntre(0, fase.tempo * 10) : 0 });
    } else {
      respostas.push({ t: 0, e: inteiroEntre(1, fase.tentativas), r: 0 });
    }
  }
  return respostas;
}

const perfeita = (fase) =>
  Array.from({ length: fase.qtdQuestoes }, () => ({ t: 1, e: 0, r: fase.tempo * 10 }));

/* =========================================================================
   1) 6.1 — a regra de pontuação
   ========================================================================= */
secao("1. pontuação: acerto soma, erro nunca subtrai (6.1)");

ok(pontosDoAcerto({ tentativa: 1, combo: 0, restanteDecimos: 0, tempoSeg: 0 }) === 100, "acerto de primeira deveria valer 100");
ok(pontosDoAcerto({ tentativa: 2, combo: 0, restanteDecimos: 0, tempoSeg: 0 }) === 60, "acerto na 2ª tentativa deveria valer 60");
ok(pontosDoAcerto({ tentativa: 3, combo: 0, restanteDecimos: 0, tempoSeg: 0 }) === 30, "acerto na 3ª tentativa deveria valer 30");
ok(pontosDoAcerto({ tentativa: 7, combo: 0, restanteDecimos: 0, tempoSeg: 0 }) === 30, "da 3ª tentativa em diante vale sempre 30");
ok(pontosDoAcerto({ tentativa: 0, combo: 5, restanteDecimos: 99, tempoSeg: 10 }) === 0, "quem não acertou não ganha ponto");
ok(pontosDoAcerto({ tentativa: 1, combo: 3, restanteDecimos: 0, tempoSeg: 0 }) === 130, "combo de 3 deveria somar 30");
ok(pontosDoAcerto({ tentativa: 1, combo: 50, restanteDecimos: 0, tempoSeg: 0 }) === 180, "o combo tem teto de +80");
ok(pontosDoAcerto({ tentativa: 1, combo: 0, restanteDecimos: 100, tempoSeg: 10 }) === 140, "cronômetro cheio deveria somar 40");
ok(pontosDoAcerto({ tentativa: 1, combo: 0, restanteDecimos: 50, tempoSeg: 10 }) === 120, "metade do tempo deveria somar 20");
ok(pontosDoAcerto({ tentativa: 1, combo: 0, restanteDecimos: 999, tempoSeg: 10 }) === 140, "tempo restante acima do cronômetro é limitado");
ok(pontosDoAcerto({ tentativa: 1, combo: 0, restanteDecimos: 100, tempoSeg: 0 }) === 100, "fase sem cronômetro não tem bônus de tempo");
ok(decimosRestantes(6.999999999) === 70, "sujeira de ponto flutuante do cronômetro deveria virar 70 décimos");
ok(decimosRestantes(-1) === 0 && decimosRestantes("x") === 0, "tempo inválido deveria virar 0");

/* A MESMA fórmula escrita como está em pontos_do_acerto() no schema.sql:
   divisão inteira, least/greatest, sem número quebrado. Se alguém mudar a
   regra de um lado só, é aqui que aparece. */
function pontosComoNoBanco(tentativa, combo, restanteDseg, tempoSeg) {
  if (tentativa < 1) return 0;
  const base = tentativa === 1 ? 100 : tentativa === 2 ? 60 : 30;
  const bonusCombo = 10 * Math.min(Math.max(combo, 0), 8);
  const divisor = 2 * Math.max(tempoSeg, 0);
  const bonusTempo = divisor === 0
    ? 0
    : Math.trunc((8 * Math.min(Math.max(restanteDseg, 0), tempoSeg * 10) + tempoSeg) / divisor);
  return base + bonusCombo + bonusTempo;
}

let divergencias = 0;
let quebrados = 0;
let comparados = 0;
for (const tempoSeg of [0, 5, 10, 12, 30]) {
  for (let tentativa = 0; tentativa <= 5; tentativa++) {
    for (let combo = 0; combo <= 12; combo++) {
      for (let r = 0; r <= tempoSeg * 10 + 5; r++) {
        const daTela = pontosDoAcerto({ tentativa, combo, restanteDecimos: r, tempoSeg });
        comparados++;
        if (daTela !== pontosComoNoBanco(tentativa, combo, r, tempoSeg)) divergencias++;
        if (!Number.isInteger(daTela) || daTela < 0) quebrados++;
      }
    }
  }
}
ok(divergencias === 0, "a regra do navegador divergiu da fórmula do banco", `${divergencias} caso(s)`);
ok(quebrados === 0, "pontos de um acerto deveriam ser sempre inteiros e nunca negativos", `${quebrados} caso(s)`);
console.log(`  ${comparados} combinações de tentativa × combo × tempo: tela e banco dão o mesmo número`);

/* Os números da regra precisam estar escritos no schema.sql também. */
const sqlPontos = SCHEMA.slice(SCHEMA.indexOf("create or replace function pontos_do_acerto"),
  SCHEMA.indexOf("$pontos_acerto$;"));
ok(/when 1 then 100 when 2 then 60 else 30 end/.test(sqlPontos), "schema.sql: a base 100 / 60 / 30 mudou de lugar ou de valor");
ok(/10 \* least\(greatest\(coalesce\(p_combo, 0\), 0\), 8\)/.test(sqlPontos), "schema.sql: o bônus de combo (10 por acerto, teto 8) mudou");
ok(REGRA_PONTUACAO.basePorTentativa.join() === "100,60,30" && REGRA_PONTUACAO.comboPasso === 10 &&
   REGRA_PONTUACAO.comboTeto === 8 && REGRA_PONTUACAO.bonusTempoMax === 40,
  "REGRA_PONTUACAO mudou — confira pontos_do_acerto() no schema.sql");

/* =========================================================================
   2) 6.1 / 6.3 — a partida inteira
   ========================================================================= */
secao("2. partida: o placar ao vivo bate com a conta refeita (6.1 / 6.3)");

let placarDivergiu = 0;
let pontoPerdido = 0;
let passouDoTeto = 0;
let contagemErrada = 0;
let partidas = 0;
for (const fase of TODAS_FASES) {
  for (let n = 0; n < 60; n++) {
    const respostas = partidaAleatoria(fase);
    partidas++;

    // o que js/partida.js faz questão a questão, no placar da tela
    let placar = 0;
    let combo = 0;
    let acertos = 0;
    let erros = 0;
    for (const q of respostas) {
      const antes = placar;
      if (q.t >= 1) {
        if (q.t > 1) combo = 0; // errou antes de acertar
        placar += pontosDoAcerto({ tentativa: q.t, combo, restanteDecimos: q.r, tempoSeg: fase.tempo });
        combo++;
        acertos++;
        erros += q.t - 1;
      } else {
        combo = 0;
        erros += q.e;
      }
      if (placar < antes) pontoPerdido++;
      if (q.t === 0 && placar !== antes) pontoPerdido++; // errar não pode mexer no placar
    }

    const conta = calcularPartida(respostas, fase);
    if (conta.pontos !== placar) placarDivergiu++;
    if (conta.acertos !== acertos || conta.erros !== erros || conta.total !== fase.qtdQuestoes) contagemErrada++;
    if (conta.pontos > pontuacaoMaxima(fase.qtdQuestoes, fase.tempo)) passouDoTeto++;
  }
}
ok(placarDivergiu === 0, "o placar ao vivo divergiu de calcularPartida", `${placarDivergiu} partida(s)`);
ok(pontoPerdido === 0, "um erro mexeu no placar — erro NUNCA pode tirar ponto", `${pontoPerdido} vez(es)`);
ok(contagemErrada === 0, "acertos/erros/total contados errado", `${contagemErrada} partida(s)`);
ok(passouDoTeto === 0, "uma partida passou de pontuacaoMaxima", `${passouDoTeto} partida(s)`);
console.log(`  ${partidas} partidas sorteadas nas ${TODAS_FASES.length} fases: nenhum ponto perdido por erro`);

for (const fase of TODAS_FASES) {
  const conta = calcularPartida(perfeita(fase), fase);
  ok(conta.pontos === pontuacaoMaxima(fase.qtdQuestoes, fase.tempo),
    `fase ${fase.id}: a partida perfeita deveria valer exatamente o teto`,
    `${conta.pontos} x ${pontuacaoMaxima(fase.qtdQuestoes, fase.tempo)}`);
  ok(conta.erros === 0 && conta.melhorCombo === fase.qtdQuestoes, `fase ${fase.id}: partida perfeita com erro ou combo quebrado`);
}

const exemplo = calcularPartida([{ t: 1 }, { t: 1 }, { t: 0, e: 3 }, { t: 2 }, { t: 1 }], { tentativas: 3, tempo: 0 });
ok(exemplo.pontos === 100 + 110 + 0 + 60 + 110, "exemplo documentado deveria somar 380", String(exemplo.pontos));
ok(exemplo.acertos === 4 && exemplo.erros === 4 && exemplo.melhorCombo === 2, "exemplo: acertos 4, erros 4, melhor combo 2",
  JSON.stringify(exemplo));

/* =========================================================================
   3) 6.2 — estrelas e medalha
   ========================================================================= */
secao("3. medalhas: o mesmo critério das estrelas (6.2)");

ok(nivelDaRecompensa(0) === null, "0 estrelas não deveria dar medalha");
ok(nivelDaRecompensa(1) === "bronze" && nivelDaRecompensa(2) === "prata" && nivelDaRecompensa(3) === "ouro",
  "1 / 2 / 3 estrelas deveriam ser bronze / prata / ouro");
ok(ORDEM_DOS_NIVEIS.length >= 2, "a história pede ao menos 2 níveis de recompensa");
ok(ORDEM_DOS_NIVEIS.every((n, i) => NIVEIS[n] && NIVEIS[n].estrelas === i + 1), "NIVEIS fora de ordem com as estrelas");
ok(nivelValido("ouro", 1) === "ouro" && nivelValido("diamante", 2) === "prata" && nivelValido(null, 0) === null,
  "nível desconhecido vindo do banco deveria cair no cálculo pelas estrelas");

let incoerencias = 0;
for (const fase of TODAS_FASES) {
  let anterior = 0;
  for (let acertos = 0; acertos <= fase.qtdQuestoes; acertos++) {
    const estrelas = calcularEstrelas(acertos, fase.qtdQuestoes, fase.meta);
    if (estrelas < anterior) incoerencias++; // acertar mais nunca pode dar menos estrela
    if ((estrelas >= 1) !== (nivelDaRecompensa(estrelas) !== null)) incoerencias++;
    anterior = estrelas;
  }
  ok(calcularEstrelas(fase.qtdQuestoes, fase.qtdQuestoes, fase.meta) === 3, `fase ${fase.id}: acertar tudo deveria dar ouro`);
  ok(calcularEstrelas(0, fase.qtdQuestoes, fase.meta) === 0, `fase ${fase.id}: zero acertos não deveria dar estrela`);
  for (const alvo of [1, 2, 3]) {
    const precisa = acertosParaEstrelas(alvo, fase.qtdQuestoes, fase.meta);
    ok(precisa !== null && calcularEstrelas(precisa, fase.qtdQuestoes, fase.meta) >= alvo &&
       (precisa === 0 || calcularEstrelas(precisa - 1, fase.qtdQuestoes, fase.meta) < alvo),
      `fase ${fase.id}: acertosParaEstrelas(${alvo}) não é o mínimo`, String(precisa));
  }
}
ok(incoerencias === 0, "estrelas e medalha se contradisseram", `${incoerencias} caso(s)`);
ok(calcularEstrelas(5, 0, null) === 0, "total zero não deveria dar estrela (nem dividir por zero)");

const desenhos = ORDEM_DOS_NIVEIS.map((n) => medalhaSVG(n));
ok(desenhos.every((d) => d.startsWith("<svg") && d.includes("aria-hidden")), "medalhaSVG deveria ser decorativa por padrão");
ok(new Set(desenhos).size === ORDEM_DOS_NIVEIS.length, "os três níveis deveriam ter desenhos diferentes");
ok(medalhaSVG("ouro", { rotulo: true }).includes('aria-label="Medalha de ouro"'), "medalha com rótulo deveria dizer o nome");
ok(medalhaSVG("<script>").includes("por-conquistar") && !medalhaSVG("<script>").includes("<script>"),
  "nível desconhecido deveria virar a medalha por conquistar, sem copiar o texto");

/* =========================================================================
   4) 6.3 — jogar de novo
   ========================================================================= */
secao("4. jogar de novo nunca piora o que está guardado (6.3)");

const boa = linhaDaPartida(4, { estrelas: 3, pontos: 1260, acertos: 9, total: 9, erros: 0, tempoGasto: 80, melhorCombo: 9 }, 0, "2026-10-01T10:00:00.000Z");
const ruim = linhaDaPartida(4, { estrelas: 1, pontos: 500, acertos: 6, total: 9, erros: 7, tempoGasto: 200, melhorCombo: 2 }, 1, "2026-10-05T10:00:00.000Z");
const naoConcluiu = linhaDaPartida(4, { estrelas: 0, pontos: 200, acertos: 3, total: 9, erros: 15, tempoGasto: 20, melhorCombo: 1 }, 2, "2026-10-07T10:00:00.000Z");

for (const [nome, depois] of [["boa depois ruim", melhorDaFase(boa, ruim)], ["ruim depois boa", melhorDaFase(ruim, boa)]]) {
  ok(depois.estrelas === 3 && depois.melhor_pontos === 1260 && depois.melhor_acertos === 9 && depois.melhor_combo === 9,
    `${nome}: deveria ficar o maior de estrelas/pontos/acertos/combo`, JSON.stringify(depois));
  ok(depois.erros === 0 && depois.tempo_gasto === 80, `${nome}: deveria ficar o menor de erros e tempo`, JSON.stringify(depois));
  ok(depois.data_conclusao === "2026-10-01T10:00:00.000Z", `${nome}: a data de conclusão é a da PRIMEIRA vez`);
  ok(depois.concluida === true, `${nome}: fase concluída uma vez continua concluída`);
}
ok(naoConcluiu.erros === null && naoConcluiu.tempo_gasto === null && naoConcluiu.data_conclusao === null,
  "partida sem estrela não deveria registrar erros, tempo nem data de conclusão");
const comAbandono = melhorDaFase(boa, naoConcluiu);
ok(comAbandono.tempo_gasto === 80 && comAbandono.erros === 0 && comAbandono.estrelas === 3,
  "partida abandonada rápida não pode virar o 'menor tempo' da fase", JSON.stringify(comAbandono));
ok(melhorDaFase(null, boa).melhor_pontos === 1260 && melhorDaFase(boa, null).melhor_pontos === 1260,
  "melhorDaFase deveria aceitar um lado vazio");
ok(melhorDaFase(naoConcluiu, ruim).tempo_gasto === 200, "nulo não é zero: o tempo conhecido deveria valer");

const mesclado = mesclarMapas({ 1: boa, 2: ruim }, { 2: boa, 3: ruim });
ok(Object.keys(mesclado).length === 3 && mesclado[2].estrelas === 3, "mesclarMapas deveria juntar os dois lados pelo melhor");

/* =========================================================================
   5) 6.4 — conquistas: catálogo e motor
   ========================================================================= */
secao("5. conquistas: regra é dado, não código (6.4)");

/* O catálogo de reserva precisa ser igual ao seed do banco. */
const blocoSeed = SCHEMA.slice(SCHEMA.indexOf("insert into conquistas (codigo"),
  SCHEMA.indexOf("on conflict (codigo) do nothing"));
const seed = [...blocoSeed.matchAll(
  /\(\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*(\d+)\s*\)/g
)].map((m) => ({
  codigo: m[1], nome: m[2], descricao: m[3], icone: m[4], cor: m[5],
  criterio_tipo: m[6], criterio_valor: Number(m[7]), ordem: Number(m[8]),
}));
ok(seed.length >= 10, "não consegui ler o seed de conquistas do schema.sql", `${seed.length} linha(s)`);
ok(seed.length === CONQUISTAS_PADRAO.length, "CONQUISTAS_PADRAO e o seed do banco têm tamanhos diferentes",
  `${CONQUISTAS_PADRAO.length} x ${seed.length}`);
for (const doBanco of seed) {
  const local = CONQUISTAS_PADRAO.find((c) => c.codigo === doBanco.codigo);
  if (!ok(!!local, `conquista "${doBanco.codigo}" está no banco e não em CONQUISTAS_PADRAO`)) continue;
  for (const campo of Object.keys(doBanco)) {
    ok(local[campo] === doBanco[campo], `conquista "${doBanco.codigo}": "${campo}" difere do banco`,
      `${local[campo]} x ${doBanco[campo]}`);
  }
}

/* As métricas do navegador precisam ser as mesmas chaves de metricas_do_avatar(). */
const sqlMetricas = SCHEMA.slice(SCHEMA.indexOf("create or replace function metricas_do_avatar"),
  SCHEMA.indexOf("$metricas$;"));
const tiposDoBanco = [...sqlMetricas.matchAll(/^\s+'([a-z_]+)',\s*$/gm)].map((m) => m[1]);
ok(tiposDoBanco.length > 0 && tiposDoBanco.slice().sort().join() === TIPOS_DE_CRITERIO.slice().sort().join(),
  "TIPOS_DE_CRITERIO difere das chaves de metricas_do_avatar()",
  `banco: ${tiposDoBanco.join(", ")}`);
ok(CONQUISTAS_PADRAO.every((c) => TIPOS_DE_CRITERIO.includes(c.criterio_tipo) && c.criterio_valor > 0),
  "há conquista com criterio_tipo desconhecido ou valor inválido — nunca desbloquearia");
ok(new Set(CONQUISTAS_PADRAO.map((c) => c.codigo)).size === CONQUISTAS_PADRAO.length, "código de conquista repetido");
ok(CONQUISTAS_PADRAO.every((c) => c.nome && c.descricao.length >= 20 && c.icone),
  "toda conquista precisa de nome, ícone e uma descrição lúdica");
console.log(`  ${seed.length} conquistas e ${tiposDoBanco.length} métricas: navegador e schema.sql iguais`);

const catalogo = (await listarFasesComStatus(null)).fases; // offline: as 13 fases locais

const metricasDoZero = calcularMetricas({}, catalogo);
ok(TIPOS_DE_CRITERIO.every((t) => metricasDoZero[t] === 0), "avatar novo deveria ter todas as métricas em zero");
ok(conquistasMerecidas(CONQUISTAS_PADRAO, metricasDoZero).length === 0, "avatar novo não deveria ter conquista");

/* Avatar que jogou tudo perfeito, uma vez cada fase. */
const jornada = {};
for (const fase of TODAS_FASES) {
  const conta = calcularPartida(perfeita(fase), fase);
  jornada[fase.id] = linhaDaPartida(fase.id, {
    ...conta, estrelas: calcularEstrelas(conta.acertos, conta.total, fase.meta), tempoGasto: 60,
  }, 0);
}
const metricasCheias = calcularMetricas(jornada, catalogo);
const extras = TODAS_FASES.filter((f) => f.extra).length;
const cronometradas = TODAS_FASES.filter((f) => f.tempo > 0).length;
ok(metricasCheias.fases_concluidas === TODAS_FASES.length, "fases_concluidas errado", String(metricasCheias.fases_concluidas));
ok(metricasCheias.fases_extras_concluidas === extras, "fases_extras_concluidas errado");
ok(metricasCheias.fases_principais_concluidas === TODAS_FASES.length - extras, "fases_principais_concluidas errado");
ok(metricasCheias.fases_cronometradas_concluidas === cronometradas, "fases_cronometradas_concluidas errado");
ok(metricasCheias.percentual_concluido === 100, "percentual_concluido deveria ser 100");
ok(metricasCheias.estrelas_total === TODAS_FASES.length * 3, "estrelas_total errado");
ok(metricasCheias.medalhas_ouro === TODAS_FASES.length && metricasCheias.medalhas_prata === TODAS_FASES.length,
  "medalhas_prata conta prata OU ouro; medalhas_ouro só ouro");
ok(metricasCheias.fases_perfeitas === TODAS_FASES.length, "fases_perfeitas errado");
ok(metricasCheias.partidas_jogadas === TODAS_FASES.length, "partidas_jogadas errado");
ok(metricasCheias.pontos_total === TODAS_FASES.reduce((s, f) => s + pontuacaoMaxima(f.qtdQuestoes, f.tempo), 0),
  "pontos_total deveria ser a soma da melhor pontuação de cada fase");
ok(conquistasMerecidas(CONQUISTAS_PADRAO, metricasCheias).length === CONQUISTAS_PADRAO.length,
  "quem concluiu tudo perfeito deveria merecer todas as conquistas",
  `faltou: ${CONQUISTAS_PADRAO.map((c) => c.codigo).filter((c) => !conquistasMerecidas(CONQUISTAS_PADRAO, metricasCheias).includes(c)).join(", ")}`);

/* Só a fase 1, com 5 de 8: concluída no bronze. */
const umaFase = { 1: linhaDaPartida(1, { estrelas: 1, pontos: 420, acertos: 5, total: 8, erros: 6, tempoGasto: 90, melhorCombo: 2 }, 0) };
const merecidasUma = conquistasMerecidas(CONQUISTAS_PADRAO, calcularMetricas(umaFase, catalogo));
ok(merecidasUma.join() === "primeiro_passo", "uma fase no bronze deveria desbloquear só 'primeiro_passo'", merecidasUma.join(", "));

/* O motor não conhece conquista pelo nome: uma regra NOVA funciona sem mexer em código. */
const nova = { codigo: "inventada", nome: "Inventada agora", criterio_tipo: "melhor_combo", criterio_valor: 9 };
ok(conquistasMerecidas([nova], metricasCheias).join() === "inventada", "regra nova com métrica existente deveria funcionar sem código");
ok(conquistasMerecidas([{ ...nova, criterio_tipo: "nao_existe" }], metricasCheias).length === 0, "criterio_tipo desconhecido nunca desbloqueia");
ok(conquistasMerecidas([{ ...nova, criterio_valor: 0 }, { ...nova, criterio_valor: -5 }, { ...nova, criterio_valor: "x" }], metricasCheias).length === 0,
  "criterio_valor inválido nunca desbloqueia");
ok(conquistasMerecidas(null, metricasCheias).length === 0 && conquistasMerecidas([null, {}, { codigo: "" }], null).length === 0,
  "catálogo torto não deveria desbloquear nada");

/* Conquista é para sempre: continua desbloqueada mesmo se a métrica cair. */
const guardadas = montarConquistas(CONQUISTAS_PADRAO, metricasDoZero, { cofre_cheio: "2026-10-01T10:00:00.000Z" });
const cofre = guardadas.find((c) => c.codigo === "cofre_cheio");
ok(cofre.desbloqueada && cofre.data_desbloqueio === "2026-10-01T10:00:00.000Z", "conquista já ganha deveria continuar desbloqueada");
ok(guardadas.filter((c) => c.desbloqueada).length === 1, "só a conquista guardada deveria estar desbloqueada");
ok(guardadas.every((c, i) => i === 0 || guardadas[i - 1].ordem <= c.ordem), "conquistas fora da ordem do catálogo");

const milPontos = { ...CONQUISTAS_PADRAO.find((c) => c.codigo === "mil_pontos"), valor_atual: 640, desbloqueada: false };
ok(textoDoProgresso(milPontos) === `${formatarPontos(640)} de ${formatarPontos(1000)}`, "textoDoProgresso errado", textoDoProgresso(milPontos));
ok(Math.abs(fracaoDaConquista(milPontos) - 0.64) < 1e-9, "fracaoDaConquista errado");
ok(fracaoDaConquista({ ...milPontos, desbloqueada: true }) === 1 && fracaoDaConquista({ ...milPontos, valor_atual: 99999 }) === 1,
  "fração da conquista não pode passar de 1");
ok(textoDoProgresso({ criterio_tipo: "percentual_concluido", criterio_valor: 100, valor_atual: 53.8 }) === "53%", "percentual deveria aparecer como 53%");
ok(proximoObjetivo(guardadas, "pontos_total").codigo === "mil_pontos", "o próximo objetivo de pontos deveria ser o de menor alvo ainda bloqueado");
ok(proximoObjetivo(guardadas, "nao_existe") === null, "sem conquista daquele tipo, não há próximo objetivo");

/* =========================================================================
   6) 6.5 / 6.7 — o painel "Meu progresso"
   ========================================================================= */
secao("6. painel Meu progresso (6.5 / 6.7)");

const painelNovo = montarPainelLocal({ fases: catalogo, progresso: {}, desbloqueadas: {} });
ok(painelNovo.fases.length === TODAS_FASES.length, "o painel deveria ter todas as fases");
ok(painelNovo.resumo.fases_total === TODAS_FASES.length && painelNovo.resumo.estrelas_max === TODAS_FASES.length * 3, "totais do painel errados");
ok(painelNovo.resumo.fases_concluidas === 0 && painelNovo.resumo.pontuacao_total === 0, "avatar novo deveria começar zerado");
ok(painelNovo.resumo.fase_atual && painelNovo.resumo.fase_atual.ordem === 1, "a fase atual de um avatar novo é a primeira da trilha");
ok(painelNovo.conquistas.length === CONQUISTAS_PADRAO.length && painelNovo.conquistas.every((c) => !c.desbloqueada),
  "avatar novo deveria ver a galeria inteira, toda bloqueada");

/* Três fases concluídas (ouro, prata, bronze), a quarta liberada. */
const estrelasDe = { 1: 3, 2: 2, 3: 1 };
const trilha = catalogo.map((f) => ({
  ...f,
  estrelas: estrelasDe[f.id] || 0,
  melhor_pontos: estrelasDe[f.id] ? 300 * estrelasDe[f.id] : 0,
  concluida: !!estrelasDe[f.id],
  status: estrelasDe[f.id] ? "concluida" : f.id === 4 ? "liberada" : "bloqueada",
}));
const espelho = {
  1: { fase: 1, melhor_acertos: 8, erros: 0, tempo_gasto: 70, melhor_combo: 8, tentativas: 2 },
  2: { fase: 2, melhor_acertos: 7, erros: 2, tempo_gasto: 95, melhor_combo: 4, tentativas: 1 },
  3: { fase: 3, melhor_acertos: 5, erros: 6, tempo_gasto: 120, melhor_combo: 2, tentativas: 1 },
};
const painel = montarPainelLocal({ fases: trilha, progresso: espelho, desbloqueadas: {}, agora: "2026-10-08T12:00:00.000Z" });
ok(painel.resumo.fases_concluidas === 3 && painel.resumo.estrelas === 6, "resumo: fases concluídas / estrelas errados", JSON.stringify(painel.resumo));
ok(painel.resumo.pontuacao_total === 900 + 600 + 300, "a pontuação total é a soma da MELHOR pontuação de cada fase", String(painel.resumo.pontuacao_total));
ok(painel.resumo.medalhas.ouro === 1 && painel.resumo.medalhas.prata === 1 && painel.resumo.medalhas.bronze === 1,
  "resumo de medalhas errado", JSON.stringify(painel.resumo.medalhas));
ok(painel.resumo.fase_atual && painel.resumo.fase_atual.fase_id === 4, "a fase atual é a primeira liberada e não concluída");
ok(painel.fases.find((f) => f.fase_id === 1).nivel_recompensa === "ouro" && painel.fases.find((f) => f.fase_id === 5).nivel_recompensa === null,
  "cada fase do painel deveria trazer a própria medalha");
const ganhas = painel.conquistas.filter((c) => c.desbloqueada).map((c) => c.codigo).sort().join();
// 1 ouro, 1 fase sem erro, combo de 8, 1.800 pontos e a primeira fase concluída
ok(ganhas === "brilho_dourado,mil_pontos,pegando_fogo,primeiro_passo,tudo_certinho", "conquistas do painel local erradas", ganhas);
ok(painel.resumo.conquistas_desbloqueadas === 5 && painel.resumo.conquistas_total === CONQUISTAS_PADRAO.length, "contagem de conquistas do resumo errada");
ok(painel.conquistas.find((c) => c.codigo === "rumo_certo").valor_atual === 3, "valor_atual deveria alimentar o '3 de 5' da galeria");

/* O que o banco devolve (painel_progresso) passa pelo mesmo conferente. */
const doBanco = normalizarPainel({
  resumo: { pontuacao_total: 1800, fases_concluidas: 999 }, // o resumo é refeito a partir das listas
  fases: painel.fases.map((f) => ({ ...f, nivel_recompensa: f.fase_id === 1 ? "diamante" : f.nivel_recompensa })),
  conquistas: painel.conquistas,
});
ok(!!doBanco && doBanco.resumo.fases_concluidas === 3, "o resumo deveria ser recalculado a partir das fases, não copiado");
ok(doBanco.resumo.pontuacao_total === 1800, "a pontuação total do servidor deveria ser respeitada");
ok(doBanco.fases.find((f) => f.fase_id === 1).nivel_recompensa === "ouro", "medalha desconhecida deveria ser refeita pelas estrelas");
ok(normalizarPainel(null) === null && normalizarPainel({ fases: [] }) === null && normalizarPainel("x") === null,
  "painel sem fases deveria virar null (quem chama monta o painel local)");

const resumoVazio = montarResumo([], []);
ok(resumoVazio.fases_total === 0 && resumoVazio.fase_atual === null && resumoVazio.pontuacao_total === 0, "resumo vazio deveria ser todo zero");

/* =========================================================================
   7) dado torto nunca derruba a tela
   ========================================================================= */
secao("7. dado torto: nada lança exceção");

const LIXO = [null, undefined, 0, "", "texto", [], {}, [null], { fases: "x" }, { partida: 3 }, NaN, () => 1];
for (const lixo of LIXO) {
  const nome = typeof lixo === "function" ? "função" : JSON.stringify(lixo) ?? String(lixo);
  naoLanca(`calcularPartida(${nome})`, () => calcularPartida(lixo, lixo));
  naoLanca(`calcularEstrelas(${nome})`, () => calcularEstrelas(lixo, lixo, lixo));
  naoLanca(`melhorDaFase(${nome})`, () => melhorDaFase(lixo, lixo));
  naoLanca(`calcularMetricas(${nome})`, () => calcularMetricas(lixo, lixo));
  naoLanca(`conquistasMerecidas(${nome})`, () => conquistasMerecidas(lixo, lixo));
  naoLanca(`montarConquistas(${nome})`, () => montarConquistas(lixo, lixo, lixo));
  naoLanca(`normalizarConquistas(${nome})`, () => normalizarConquistas(lixo));
  naoLanca(`normalizarPainel(${nome})`, () => normalizarPainel(lixo));
  naoLanca(`normalizarResultado(${nome})`, () => normalizarResultado(lixo));
  naoLanca(`montarPainelLocal(${nome})`, () => montarPainelLocal(lixo));
  naoLanca(`medalhaSVG(${nome})`, () => medalhaSVG(lixo, lixo));
  naoLanca(`textoDoProgresso(${nome})`, () => textoDoProgresso(lixo));
  naoLanca(`formatarPontos(${nome})`, () => formatarPontos(lixo));
}
ok(calcularPartida([{ t: -3 }, { t: 99, r: "x" }, null, "a"], { tentativas: 3 }).pontos >= 0, "respostas tortas não podem dar pontuação negativa");
ok(normalizarConquista({ codigo: "x" }) === null && normalizarConquista({ nome: "Sem código" }) === null,
  "conquista sem código ou sem nome deveria ser descartada");
const semCor = normalizarConquista({ codigo: "c", nome: "N", cor: "javascript:alert(1)", icone: "", criterio_valor: -2 });
ok(/^#[0-9a-f]{6}$/i.test(semCor.cor) && semCor.icone && semCor.criterio_valor === 0, "cor/ícone/valor inválidos deveriam ganhar um padrão seguro",
  JSON.stringify(semCor));

/* O que registrar_resultado_fase devolve -> o que a tela de fim usa. */
const resultado = normalizarResultado({
  partida: { pontuacao: 1080, acertos: 8, erros: 0, total_questoes: 8, tempo_gasto: 71, melhor_combo: 8,
             estrelas: 3, nivel_recompensa: "ouro", recorde: true, primeira_conclusao: true, subiu_de_medalha: true },
  progresso: { fase_id: 1, estrelas: 3, pontuacao: 1080, acertos: 8, concluida: true, tentativas: 1 },
  novas_conquistas: [{ codigo: "primeiro_passo", nome: "Primeiro passo", desbloqueada: true }, { nome: "sem código" }],
});
ok(resultado.partida.pontos === 1080 && resultado.partida.nivel === "ouro" && resultado.partida.recorde === true,
  "normalizarResultado perdeu campo da partida", JSON.stringify(resultado?.partida));
ok(resultado.novasConquistas.length === 1 && resultado.novasConquistas[0].codigo === "primeiro_passo",
  "conquista nova torta deveria ser descartada sem levar as boas junto");
ok(normalizarResultado({ progresso: {} }) === null, "resposta sem `partida` não é um resultado");
console.log(`  ${LIXO.length} entradas ruins × 13 funções: nenhuma exceção`);

/* ========================================================================= */
console.log("\n=================================");
console.log(`${checados} verificações | ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

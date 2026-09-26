/*
  =========================================================================
  Math Kids — Teste da camada de conteúdo (js/conteudo.js) — Épico 3
  =========================================================================
  Roda no Node, SEM rede e SEM npm install. Como js/conteudo.js importa o
  Supabase de forma dinâmica e protegida, aqui todas as chamadas de RPC
  falham de propósito — é exatamente o caminho de fallback que queremos
  exercitar: "se o banco cair, o jogo continua jogável".

  O que é verificado:
    1. o verificador pega as entradas ruins (auto-teste, igual testar-dicas)
    2. normalizarProblema aceita o que é válido e devolve null para lixo,
       sem NUNCA lançar exceção
    3. criarFonteDeProblemas não repete problema, não serve duas operações
       iguais seguidas e completa com o gerador local quando o acervo acaba
    4. carregarConteudoDaFase funciona offline para TODAS as fases
    5. toda questão gerada continua alimentando as dicas do Épico 2
    6. a memória da última rodada não quebra sem localStorage

  Uso:
      cd ferramentas
      node testar-conteudo.mjs

  Sai com código 1 se achar qualquer falha (dá pra usar em CI).
  =========================================================================
*/
import {
  listarFasesComStatus,
  carregarConteudoDaFase,
  criarFonteDeProblemas,
  normalizarProblema,
  lembrarServidos,
  ultimosServidos,
} from "../js/conteudo.js";
import { TODAS_FASES } from "../js/fases.js";
import { dicaDeErro } from "../js/dicas.js";

let falhas = 0;
let checados = 0;

function ok(condicao, titulo, detalhe) {
  checados++;
  if (condicao) return true;
  falhas++;
  console.log(`[!] ${titulo}`);
  if (detalhe) console.log(`    ${detalhe}`);
  return false;
}

function secao(t) {
  console.log(`\n--- ${t} ---`);
}

/* Linha crua no formato que o Supabase devolveria. */
function linhaDoBanco(n, partes, resposta, extras = {}) {
  const uuid = `0000000-0000-4000-8000-${String(n).padStart(12, "0")}`.replace("0000000", "00000000");
  const sinais = { "+": "+", "-": "−", "*": "×", "/": "÷" };
  return {
    id: uuid,
    tipo_operacao: partes.find((p) => typeof p === "string") || "+",
    dados: {
      partes,
      operandos: partes.filter((p) => typeof p === "number"),
      operadores: partes.filter((p) => typeof p === "string"),
      expressao: partes.map((p) => (typeof p === "string" ? sinais[p] : p)).join(" ") + " =",
    },
    resposta_correta: resposta,
    elementos_visuais: { emoji: "🍎", tema: "frutas", cor: "#FF6F91", alt: "maçãs" },
    enunciado: `Historinha número ${n} com {a} e {b} já trocados.`,
    tema: "frutas",
    dificuldade: ((n - 1) % 5) + 1,
    ...extras,
  };
}

/* =========================================================================
   1) Auto-teste do verificador
   ========================================================================= */
secao("1. auto-teste: o verificador realmente reprova dado ruim?");

/* Se normalizarProblema um dia passar a aceitar estas entradas, o teste
   inteiro viraria teatro. Então provamos primeiro que ele as recusa. */
const LIXO = [
  ["nulo", null],
  ["sem dados", { resposta_correta: 3 }],
  ["dados como string", { dados: "14 + 8", resposta_correta: 22 }],
  ["partes vazio", { dados: { partes: [] }, resposta_correta: 0 }],
  ["partes não-array", { dados: { partes: "14+8" }, resposta_correta: 22 }],
  ["operador inválido", { dados: { partes: [1, "%", 2] }, resposta_correta: 3 }],
  ["número NaN", { dados: { partes: [NaN, "+", 2] }, resposta_correta: 2 }],
  ["número infinito", { dados: { partes: [Infinity, "+", 2] }, resposta_correta: 2 }],
  ["resposta ausente", { dados: { partes: [1, "+", 2] } }],
  ["resposta negativa", { dados: { partes: [1, "-", 2] }, resposta_correta: -1 }],
  ["resposta > 99", { dados: { partes: [50, "+", 60] }, resposta_correta: 110 }],
  ["resposta não confere", { dados: { partes: [14, "+", 8] }, resposta_correta: 21 }],
  ["divisão não exata", { dados: { partes: [7, "/", 2] }, resposta_correta: 3 }],
  ["resposta fracionária", { dados: { partes: [1, "+", 2] }, resposta_correta: 2.5 }],
];

const faseExemplo = TODAS_FASES[0];
for (const [nome, bruto] of LIXO) {
  let resultado;
  let lancou = false;
  try {
    resultado = normalizarProblema(bruto, faseExemplo);
  } catch (e) {
    lancou = true;
  }
  ok(!lancou, `normalizarProblema LANÇOU exceção com "${nome}"`);
  ok(resultado === null, `"${nome}" deveria virar null`, `veio: ${JSON.stringify(resultado)}`);
}
if (!falhas) console.log(`verificador OK (recusa as ${LIXO.length} entradas ruins conhecidas)`);

/* =========================================================================
   2) Problema válido é aceito por inteiro
   ========================================================================= */
secao("2. problema válido do banco");

const bom = normalizarProblema(linhaDoBanco(1, [14, "+", 8], 22), faseExemplo);
ok(!!bom, "problema válido virou null");
if (bom) {
  ok(bom.texto === "14 + 8 =", "texto da conta errado", bom.texto);
  ok(JSON.stringify(bom.partes) === "[14,\"+\",8]", "partes perdido/alterado", JSON.stringify(bom.partes));
  ok(bom.resposta === 22 && bom.respostaStr === "22", "resposta errada");
  ok(bom.slots === 2, "slots errado", String(bom.slots));
  ok(bom.visual && bom.visual.emoji === "🍎", "ilustração perdida");
  ok(typeof bom.enunciado === "string" && bom.enunciado.length > 0, "enunciado perdido");
  ok(bom.operacao === "+", "operação errada", bom.operacao);
  console.log(`  ${bom.texto} ${bom.respostaStr}  ${bom.visual.emoji}  "${bom.enunciado}"`);
}

/* Três parcelas (fase extra "Trio de números") precisa sobreviver também. */
const trio = normalizarProblema(linhaDoBanco(2, [3, "+", 5, "-", 2], 6), faseExemplo);
ok(!!trio && trio.resposta === 6, "problema de 3 parcelas rejeitado");

/* Toda operação precisa ser servida corretamente (QA 5.1). */
secao("3. as quatro operações");
for (const [partes, resp] of [[[9, "+", 7], 16], [[20, "-", 8], 12], [[6, "*", 7], 42], [[42, "/", 6], 7]]) {
  const q = normalizarProblema(linhaDoBanco(9, partes, resp), faseExemplo);
  ok(!!q && q.resposta === resp, `operação ${partes[1]} não foi servida corretamente`);
  if (q) console.log(`  ${q.operacao}  ${q.texto.padEnd(10)} ${q.respostaStr}`);
}

/* =========================================================================
   4) Fonte de problemas: não-repetição
   ========================================================================= */
secao("4. fonte de problemas (não-repetição de problema e de operação)");

const faseMista = (await carregarConteudoDaFase(10, {})).fase; // fase 10 usa + - * /
ok(!!faseMista, "não consegui montar a fase 10 offline");

/* Acervo com DUAS operações alternáveis: a fonte precisa intercalar. */
const acervoMisto = [];
for (let i = 0; i < 12; i++) {
  acervoMisto.push(linhaDoBanco(100 + i, [10 + i, "+", 3], 13 + i));
  acervoMisto.push(linhaDoBanco(200 + i, [40 + i, "-", 5], 35 + i));
}
const fonteMista = criarFonteDeProblemas(faseMista, acervoMisto);
const vistos = new Set();
let repetidos = 0;
let opSeguida = 0;
let textoSeguido = 0;
let anterior = null;
for (let i = 0; i < 20; i++) {
  const q = fonteMista.proxima();
  if (vistos.has(q.texto)) repetidos++;
  vistos.add(q.texto);
  if (anterior && q.operacao === anterior.operacao) opSeguida++;
  if (anterior && q.texto === anterior.texto) textoSeguido++;
  anterior = q;
}
ok(repetidos === 0, "a fonte repetiu problema", `${repetidos} repetição(ões)`);
ok(opSeguida === 0, "a fonte serviu duas operações iguais seguidas", `${opSeguida} vez(es)`);
ok(textoSeguido === 0, "a fonte serviu dois textos iguais seguidos");
console.log(`  20 questões servidas, 0 repetidas, 0 operações iguais seguidas`);

/* Acervo curto: precisa completar com o gerador local sem quebrar. */
secao("5. acervo curto — top-up pelo gerador local");
const fonteCurta = criarFonteDeProblemas(faseMista, [linhaDoBanco(300, [5, "+", 4], 9)]);
const doCurto = [];
for (let i = 0; i < faseMista.qtdQuestoes; i++) doCurto.push(fonteCurta.proxima());
ok(doCurto.length === faseMista.qtdQuestoes, "top-up entregou menos questões que o pedido");
ok(doCurto.every((q) => q && Number.isInteger(q.resposta)), "top-up gerou questão inválida");
ok(doCurto.some((q) => q.origem === "local"), "top-up não usou o gerador local");
ok(new Set(doCurto.map((q) => q.texto)).size === doCurto.length, "top-up repetiu conta");
console.log(`  1 problema no acervo -> ${doCurto.length} questões entregues (${doCurto.filter((q) => q.origem === "local").length} do gerador local)`);

/* =========================================================================
   6) Offline ponta a ponta: todas as fases
   ========================================================================= */
secao("6. offline: todas as fases jogáveis sem Supabase");

const listagem = await listarFasesComStatus(null);
ok(listagem.origem === "local", "sem Supabase a origem deveria ser 'local'", listagem.origem);
ok(listagem.fases.length === TODAS_FASES.length, "faltaram fases no fallback", `${listagem.fases.length}`);

/* Avatar novo (sem progresso) só pode ver a primeira fase liberada. */
const liberadas = listagem.fases.filter((f) => f.status !== "bloqueada");
ok(liberadas.length === 1 && liberadas[0].ordem === 1,
  "avatar novo deveria ver só a fase 1 liberada",
  liberadas.map((f) => f.id).join(", "));

/* A ordem não pode ter furo — é ela que define quem libera quem. */
const ordens = listagem.fases.map((f) => f.ordem).sort((a, b) => a - b);
ok(ordens.every((o, i) => o === i + 1), "a ordem das fases tem furo", ordens.join(","));

let totalQuestoes = 0;
let dicasRuins = 0;
for (const faseLocal of TODAS_FASES) {
  const c = await carregarConteudoDaFase(faseLocal.id, {});
  ok(!!c.fase, `fase ${faseLocal.id} não carregou`);
  ok(c.origem === "local", `fase ${faseLocal.id}: origem deveria ser 'local'`, c.origem);
  ok(c.problemas.length >= faseLocal.qtdQuestoes,
    `fase ${faseLocal.id}: veio com menos problemas que o necessário`,
    `${c.problemas.length} < ${faseLocal.qtdQuestoes}`);

  const fonte = criarFonteDeProblemas(c.fase, c.problemas);
  let anteriorQ = null;
  for (let i = 0; i < faseLocal.qtdQuestoes; i++) {
    const q = fonte.proxima();
    totalQuestoes++;

    if (!ok(q && Array.isArray(q.partes) && q.partes.length >= 3,
      `fase ${faseLocal.id}: questão sem 'partes' — as dicas do Épico 2 quebrariam`)) continue;
    ok(q.resposta >= 0 && q.resposta <= 99, `fase ${faseLocal.id}: resposta fora de 0..99`, String(q.resposta));
    ok(q.respostaStr.length === q.slots, `fase ${faseLocal.id}: slots não batem com a resposta`);
    ok(!!(q.visual && q.visual.emoji), `fase ${faseLocal.id}: questão sem ilustração`);
    if (anteriorQ) ok(q.texto !== anteriorQ.texto, `fase ${faseLocal.id}: conta repetida seguida`);
    anteriorQ = q;

    // Épico 2 não pode regredir: a dica sai da conta que está na tela.
    for (const nivel of [1, 2]) {
      const d = dicaDeErro(q, nivel);
      if (typeof d !== "string" || /NaN|undefined/.test(d) || !d.includes("💡")) {
        dicasRuins++;
        if (dicasRuins <= 5) console.log(`[!] dica ruim (fase ${faseLocal.id}, ${q.texto}): ${d}`);
      }
    }
  }
}
ok(dicasRuins === 0, "dicas do Épico 2 quebraram com as questões do Épico 3", `${dicasRuins} dica(s)`);
console.log(`  ${TODAS_FASES.length} fases jogadas offline, ${totalQuestoes} questões, ${totalQuestoes * 2} dicas conferidas`);

/* =========================================================================
   7) Fase inexistente e memória da rodada
   ========================================================================= */
secao("7. bordas");

const inexistente = await carregarConteudoDaFase(9999, {});
ok(inexistente.fase === null, "fase inexistente deveria devolver fase null");
ok(Array.isArray(inexistente.problemas), "fase inexistente deveria devolver lista de problemas");
ok(!!inexistente.erro, "fase inexistente deveria explicar o erro");
console.log(`  fase 9999 -> erro tratado: "${inexistente.erro}"`);

/* Sem localStorage (Node, aba privada) nada pode explodir. */
let lancouStorage = false;
try {
  lembrarServidos(1, ["a", "b"]);
  ultimosServidos(1);
} catch {
  lancouStorage = true;
}
ok(!lancouStorage, "memória da rodada lançou exceção sem localStorage");
ok(Array.isArray(ultimosServidos(1)), "ultimosServidos deveria devolver array sempre");
console.log(`  sem localStorage: lembrarServidos/ultimosServidos seguem em silêncio`);

/* ========================================================================= */
console.log("\n=================================");
console.log(`${checados} verificações | ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

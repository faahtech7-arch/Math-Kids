/*
  =========================================================================
  Math Kids — Regra de pontuação, estrelas e recorde (Épico 4, história 6.1)
  =========================================================================
  Este arquivo é o ESPELHO, no navegador, da regra que mora no Supabase
  (pontos_do_acerto, calcular_partida e estrelas_do_resultado em
  supabase/schema.sql). O servidor é quem manda: ao concluir a fase ele
  refaz a conta inteira. O espelho existe por dois motivos:

    1. mostrar o placar AO VIVO, a cada acerto, sem ir ao banco;
    2. o jogo continuar pontuando quando o banco não responde.

  Mudou a regra aqui? Mude lá também (e vice-versa).

  A regra, em uma frase: acerto soma, erro NUNCA subtrai.

    pontos de um acerto = base + combo + tempo
      base   100 de primeira | 60 na 2ª tentativa | 30 da 3ª em diante
      combo  10 × acertos seguidos antes deste (até 8, ou seja, +80)
      tempo  só em fase com cronômetro: até 40, pelo tempo que sobrou

  Errar só zera o combo e faz o próximo acerto valer a base menor.

  Tudo aqui é conta de INTEIROS (o tempo entra em décimos de segundo). É de
  propósito: com número quebrado o navegador e o Postgres arredondariam
  diferente de vez em quando, e o placar da tela não bateria com o salvo.

  Sem DOM e sem rede — por isso ferramentas/testar-recompensas.mjs consegue
  rodar isto no Node.
  =========================================================================
*/

export const REGRA_PONTUACAO = Object.freeze({
  basePorTentativa: Object.freeze([100, 60, 30]), // de primeira | 2ª | 3ª em diante
  comboPasso: 10,
  comboTeto: 8,
  bonusTempoMax: 40,
});

const TENTATIVAS_PADRAO = 3;

function inteiro(v, padrao) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : padrao;
}

function limitar(n, min, max) {
  return Math.min(Math.max(n, min), max);
}

/* O cronômetro da tela anda em passos de 0,1 s e acumula sujeira de ponto
   flutuante (6.999999999). Vira décimo inteiro ANTES de qualquer conta. */
export function decimosRestantes(tempoRestanteSeg) {
  const n = Number(tempoRestanteSeg);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 10)) : 0;
}

/*
  Pontos de UM acerto.
    tentativa        em qual tentativa acertou (1 = de primeira)
    combo            acertos seguidos ANTES deste
    restanteDecimos  décimos de segundo que sobraram no cronômetro
    tempoSeg         cronômetro da fase em segundos (0 = sem cronômetro)
*/
export function pontosDoAcerto({ tentativa, combo, restanteDecimos, tempoSeg }) {
  const t = inteiro(tentativa, 0);
  if (t < 1) return 0;

  const bases = REGRA_PONTUACAO.basePorTentativa;
  const base = bases[Math.min(t, bases.length) - 1];
  const bonusCombo = REGRA_PONTUACAO.comboPasso * limitar(inteiro(combo, 0), 0, REGRA_PONTUACAO.comboTeto);

  const tempo = inteiro(tempoSeg, 0);
  let bonusTempo = 0;
  if (tempo > 0) {
    const r = limitar(inteiro(restanteDecimos, 0), 0, tempo * 10);
    // arredonda (restante / tempo) × máximo usando só inteiros
    bonusTempo = Math.floor((2 * REGRA_PONTUACAO.bonusTempoMax * r + 10 * tempo) / (20 * tempo));
  }
  return base + bonusCombo + bonusTempo;
}

/* O máximo que uma partida pode valer: tudo de primeira, sem quebrar o
   combo e com o cronômetro cheio. */
export function pontuacaoMaxima(total, tempoSeg) {
  const tempo = Math.max(0, inteiro(tempoSeg, 0));
  let soma = 0;
  for (let i = 0; i < Math.max(0, inteiro(total, 0)); i++) {
    soma += pontosDoAcerto({ tentativa: 1, combo: i, restanteDecimos: tempo * 10, tempoSeg: tempo });
  }
  return soma;
}

/*
  Refaz a partida inteira a partir do registro de cada questão — é o MESMO
  array que vai para a RPC registrar_resultado_fase:
    { t: tentativa em que acertou (0 = não acertou),
      e: tentativas que não deram certo (só importa quando t = 0),
      r: décimos de segundo que sobravam no cronômetro ao acertar }

  `erros` conta resposta errada E tempo estourado; erros = 0 quer dizer
  "acertou todas de primeira".
*/
export function calcularPartida(respostas, fase) {
  const maxTentativas = limitar(inteiro(fase?.tentativas, TENTATIVAS_PADRAO), 1, 10);
  const tempoSeg = Math.max(0, inteiro(fase?.tempoSeg ?? fase?.tempo, 0));
  const lista = Array.isArray(respostas) ? respostas : [];

  let pontos = 0;
  let acertos = 0;
  let erros = 0;
  let combo = 0;
  let melhorCombo = 0;

  for (const item of lista) {
    const t = limitar(inteiro(item?.t, 0), 0, maxTentativas);
    if (t >= 1) {
      const errou = t - 1;
      if (errou > 0) combo = 0; // errar no meio do caminho quebra a sequência
      pontos += pontosDoAcerto({ tentativa: t, combo, restanteDecimos: item?.r, tempoSeg });
      combo++;
      melhorCombo = Math.max(melhorCombo, combo);
      acertos++;
      erros += errou;
    } else {
      // não acertou: gastou as tentativas ou o tempo acabou (no mínimo 1 erro)
      erros += limitar(inteiro(item?.e, maxTentativas), 1, maxTentativas);
      combo = 0;
    }
  }

  return { pontos, acertos, erros, melhorCombo, total: lista.length };
}

/* Estrelas pelo aproveitamento (acertos ÷ total) contra as metas da fase.
   A medalha sai daqui também — ver nivelDaRecompensa em js/recompensas.js. */
export function calcularEstrelas(acertos, total, meta) {
  const t = Number(total);
  if (!(t > 0)) return 0;
  const razao = Number(acertos) / t;
  const m = meta || {};
  if (razao >= (m.tres ?? 1.0)) return 3;
  if (razao >= (m.duas ?? 0.8)) return 2;
  if (razao >= (m.uma ?? 0.6)) return 1;
  return 0;
}

/* Quantos acertos faltam para a próxima estrela (ou null se já tem as 3).
   Usado na tela de fim para dar a meta seguinte em vez de só o resultado. */
export function acertosParaEstrelas(estrelasDesejadas, total, meta) {
  const m = meta || {};
  const limite = [m.uma ?? 0.6, m.duas ?? 0.8, m.tres ?? 1.0][estrelasDesejadas - 1];
  const t = inteiro(total, 0);
  if (limite === undefined || t <= 0) return null;
  for (let a = 0; a <= t; a++) {
    if (calcularEstrelas(a, t, m) >= estrelasDesejadas) return a;
  }
  return null;
}

/* ===================================================================== */
/* Regra de "jogar de novo" (história 6.3)                                */
/* ===================================================================== */

function menorDefinido(a, b) {
  const va = Number.isFinite(a) ? a : null;
  const vb = Number.isFinite(b) ? b : null;
  if (va === null) return vb;
  if (vb === null) return va;
  return Math.min(va, vb);
}

function maisAntiga(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a <= b ? a : b; // datas em ISO comparam certo como texto
}

/*
  Junta duas linhas da MESMA fase guardando o melhor de cada campo — a
  mesma regra do `on conflict` de gravar_resultado() no schema.sql:

    estrelas / melhor_pontos / melhor_acertos / melhor_combo -> o maior
    erros / tempo_gasto  -> o menor (nulo = "ainda não sei", não é zero)
    data_conclusao       -> a mais antiga (a primeira vez que concluiu)

  Repetir uma fase nunca piora o que está guardado.
*/
export function melhorDaFase(a, b) {
  a = a || {};
  b = b || {};
  const estrelas = Math.max(a.estrelas || 0, b.estrelas || 0);
  return {
    fase: Number(a.fase ?? b.fase),
    estrelas,
    melhor_pontos: Math.max(a.melhor_pontos || 0, b.melhor_pontos || 0),
    melhor_acertos: Math.max(a.melhor_acertos || 0, b.melhor_acertos || 0),
    total_questoes: b.total_questoes ?? a.total_questoes ?? 0,
    concluida: !!(a.concluida || b.concluida || estrelas >= 1),
    tentativas: Math.max(a.tentativas || 0, b.tentativas || 0),
    erros: menorDefinido(a.erros, b.erros),
    tempo_gasto: menorDefinido(a.tempo_gasto, b.tempo_gasto),
    melhor_combo: Math.max(a.melhor_combo || 0, b.melhor_combo || 0),
    data_conclusao: maisAntiga(a.data_conclusao, b.data_conclusao),
    atualizado_em: b.atualizado_em || a.atualizado_em || null,
  };
}

export function mesclarMapas(base, extra) {
  const out = { ...base };
  for (const fase of Object.keys(extra || {})) {
    out[fase] = melhorDaFase(out[fase], extra[fase]);
  }
  return out;
}

/* Transforma o resultado de UMA partida na linha que entra no espelho
   local. Erros e tempo só valem quando a fase foi concluída — igual ao
   banco, para o "menor tempo" não ser o de uma partida abandonada. */
export function linhaDaPartida(fase, partida, tentativasAnteriores, agora) {
  const concluiu = partida.estrelas >= 1;
  const quando = agora || new Date().toISOString();
  return {
    fase: Number(fase),
    estrelas: partida.estrelas,
    melhor_pontos: Math.round(partida.pontos),
    melhor_acertos: partida.acertos,
    total_questoes: partida.total,
    concluida: concluiu,
    tentativas: (tentativasAnteriores || 0) + 1,
    erros: concluiu && Number.isFinite(partida.erros) ? partida.erros : null,
    tempo_gasto: concluiu && Number.isFinite(partida.tempoGasto) ? partida.tempoGasto : null,
    melhor_combo: partida.melhorCombo || 0,
    data_conclusao: concluiu ? quando : null,
    atualizado_em: quando,
  };
}

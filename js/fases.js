/*
  =========================================================================
  Math Kids — Configuração das fases (Sistema de Fases)
  =========================================================================
  Escopo: soma, subtração, multiplicação e divisão de dificuldade média,
  10 fases iniciais + fases extras, para crianças de 7 a 10 anos.

  Cada fase descreve SÓ os parâmetros de dificuldade. A geração dos números
  fica em js/gerador.js. Regras gerais garantidas pelo gerador:
    - subtração nunca dá resultado negativo
    - divisão é sempre exata (resto 0)
    - resposta tem no máximo 2 dígitos (0–99)
  =========================================================================
*/

export const META_PADRAO = { uma: 0.6, duas: 0.8, tres: 1.0 };

export const FASES = [
  {
    id: 1, nome: "Primeiras somas", emoji: "➕", cor: "#2EC4B6",
    dica: "Some os dois números e escreva a resposta.",
    operacoes: ["+"], qtdQuestoes: 8, tentativas: 3, tempo: 0,
    regras: { "+": { aMin: 1, aMax: 12, bMin: 1, bMax: 8, somaMax: 20 } },
    meta: META_PADRAO,
  },
  {
    id: 2, nome: "Menos e menos", emoji: "➖", cor: "#4CC9F0",
    dica: "Tire o segundo número do primeiro.",
    operacoes: ["-"], qtdQuestoes: 8, tentativas: 3, tempo: 0,
    regras: { "-": { minMax: 20, subMin: 1, subMax: 12 } },
    meta: META_PADRAO,
  },
  {
    id: 3, nome: "Vai e volta", emoji: "🔁", cor: "#7ED957",
    dica: "Presta atenção no sinal: pode ser mais ou menos.",
    operacoes: ["+", "-"], qtdQuestoes: 8, tentativas: 3, tempo: 0,
    regras: {
      "+": { aMin: 5, aMax: 20, bMin: 3, bMax: 10, somaMax: 30 },
      "-": { minMax: 30, subMin: 2, subMax: 15 },
    },
    meta: META_PADRAO,
  },
  {
    id: 4, nome: "Somas com dezenas", emoji: "🔢", cor: "#FFD23F",
    dica: "Soma números maiores. Vale contar de 10 em 10.",
    operacoes: ["+"], qtdQuestoes: 9, tentativas: 3, tempo: 0,
    regras: { "+": { aMin: 12, aMax: 58, bMin: 6, bMax: 40, somaMax: 99 } },
    meta: META_PADRAO,
  },
  {
    id: 5, nome: "Subtração com dezenas", emoji: "🧮", cor: "#FF9A3D",
    dica: "Tira o de baixo do de cima. Nunca fica negativo.",
    operacoes: ["-"], qtdQuestoes: 9, tentativas: 3, tempo: 0,
    regras: { "-": { minMax: 99, subMin: 8, subMax: 55 } },
    meta: META_PADRAO,
  },
  {
    id: 6, nome: "Tabuada fácil", emoji: "✖️", cor: "#B892FF",
    dica: "Multiplicação é soma repetida: 4×3 é 4+4+4.",
    operacoes: ["*"], qtdQuestoes: 9, tentativas: 3, tempo: 0,
    regras: { "*": { tabuadas: [2, 3, 4, 5], outroMin: 2, outroMax: 10 } },
    meta: META_PADRAO,
  },
  {
    id: 7, nome: "Tabuada braba", emoji: "💪", cor: "#FF6F91",
    dica: "As tabuadas do 6 ao 9. Respira e vai com calma.",
    operacoes: ["*"], qtdQuestoes: 9, tentativas: 3, tempo: 0,
    regras: { "*": { tabuadas: [6, 7, 8, 9], outroMin: 2, outroMax: 9 } },
    meta: META_PADRAO,
  },
  {
    id: 8, nome: "Dividir é repartir", emoji: "➗", cor: "#2EC4B6",
    dica: "Quantas vezes o segundo número cabe no primeiro?",
    operacoes: ["/"], qtdQuestoes: 9, tentativas: 3, tempo: 0,
    regras: { "/": { divisores: [2, 3, 4, 5], quocMin: 2, quocMax: 10 } },
    meta: META_PADRAO,
  },
  {
    id: 9, nome: "Divisão braba", emoji: "🚀", cor: "#4CC9F0",
    dica: "Divisão exata pelas tabuadas do 6 ao 9.",
    operacoes: ["/"], qtdQuestoes: 9, tentativas: 3, tempo: 0,
    regras: { "/": { divisores: [6, 7, 8, 9], quocMin: 2, quocMax: 9 } },
    meta: META_PADRAO,
  },
  {
    id: 10, nome: "Desafio final", emoji: "👑", cor: "#FFD23F",
    dica: "Tudo junto: mais, menos, vezes e dividir.",
    operacoes: ["+", "-", "*", "/"], qtdQuestoes: 10, tentativas: 3, tempo: 0,
    regras: {
      "+": { aMin: 10, aMax: 55, bMin: 6, bMax: 40, somaMax: 99 },
      "-": { minMax: 90, subMin: 6, subMax: 45 },
      "*": { tabuadas: [3, 4, 6, 7, 8], outroMin: 2, outroMax: 9 },
      "/": { divisores: [3, 4, 6, 7, 8], quocMin: 2, quocMax: 9 },
    },
    meta: META_PADRAO,
  },
];

export const FASES_EXTRAS = [
  {
    id: 101, nome: "Trio de números", emoji: "🎲", cor: "#7ED957", extra: true,
    dica: "Três números de uma vez! Resolve da esquerda pra direita.",
    operacoes: ["+", "-"], parcelas: 3, qtdQuestoes: 8, tentativas: 3, tempo: 0,
    regras: {
      "+": { aMin: 3, aMax: 18, bMin: 2, bMax: 15, somaMax: 50 },
      "-": { minMax: 40, subMin: 1, subMax: 12 },
    },
    meta: { uma: 0.6, duas: 0.8, tres: 0.9 },
  },
  {
    id: 102, nome: "Relâmpago da tabuada", emoji: "⚡", cor: "#FF6F91", extra: true,
    dica: "Vezes e dividir contra o relógio: 10 segundos por conta.",
    operacoes: ["*", "/"], qtdQuestoes: 10, tentativas: 2, tempo: 10,
    regras: {
      "*": { tabuadas: [2, 3, 4, 5, 6, 7, 8, 9], outroMin: 2, outroMax: 9 },
      "/": { divisores: [2, 3, 4, 5, 6, 7, 8, 9], quocMin: 2, quocMax: 9 },
    },
    meta: { uma: 0.6, duas: 0.8, tres: 0.9 },
  },
  {
    id: 103, nome: "Missão maluca", emoji: "🌟", cor: "#FFD23F", extra: true,
    dica: "As quatro operações com cronômetro. Foco total!",
    operacoes: ["+", "-", "*", "/"], qtdQuestoes: 10, tentativas: 2, tempo: 12,
    regras: {
      "+": { aMin: 12, aMax: 55, bMin: 8, bMax: 40, somaMax: 99 },
      "-": { minMax: 95, subMin: 8, subMax: 50 },
      "*": { tabuadas: [3, 4, 5, 6, 7, 8, 9], outroMin: 2, outroMax: 9 },
      "/": { divisores: [3, 4, 5, 6, 7, 8, 9], quocMin: 2, quocMax: 9 },
    },
    meta: { uma: 0.6, duas: 0.8, tres: 0.9 },
  },
];

export const TODAS_FASES = [...FASES, ...FASES_EXTRAS];

export function acharFase(id) {
  return TODAS_FASES.find((f) => f.id === Number(id)) || null;
}

/* Regra de progressão (Sistema de Progressão):
   - fase 1 sempre liberada
   - fase N+1 libera quando a fase N tem pelo menos 1 estrela
   - fases extras liberam quando a fase 10 tem pelo menos 1 estrela      */
export function faseLiberada(id, progresso) {
  const idn = Number(id);
  if (idn === 1) return true;
  if (idn <= 10) {
    const ant = progresso?.[idn - 1];
    return !!ant && ant.estrelas >= 1;
  }
  const dez = progresso?.[10];
  return !!dez && dez.estrelas >= 1;
}

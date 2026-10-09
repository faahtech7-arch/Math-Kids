/*
  =========================================================================
  Math Kids — Gerador de contas por fase
  =========================================================================
  Recebe a config de uma fase (js/fases.js) e devolve contas prontas.

  Garantias:
    - subtração nunca fica negativa
    - divisão é sempre exata (resto 0)
    - resposta entre 0 e 99 (no máximo 2 dígitos → no máximo 2 quadrados)
    - sem conta repetida dentro da mesma fase
  =========================================================================
*/

const SINAL = { "+": "+", "-": "−", "*": "×", "/": "÷" };

const rint = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const escolher = (arr) => arr[Math.floor(Math.random() * arr.length)];

function gerarSimples(op, regras) {
  const r = regras[op] || {};
  if (op === "+") {
    const somaMax = r.somaMax ?? 99;
    for (let i = 0; i < 60; i++) {
      const a = rint(r.aMin ?? 1, r.aMax ?? 20);
      const b = rint(r.bMin ?? 1, r.bMax ?? 20);
      if (a + b <= somaMax) return { partes: [a, "+", b], resposta: a + b };
    }
    const a = rint(r.aMin ?? 1, Math.min(r.aMax ?? 20, somaMax - 1));
    return { partes: [a, "+", somaMax - a], resposta: somaMax };
  }
  if (op === "-") {
    const minMax = r.minMax ?? 20;
    const subMin = r.subMin ?? 1;
    const subMax = r.subMax ?? Math.floor(minMax / 2);
    const m = rint(subMax + 1, minMax);
    const s = rint(subMin, Math.min(subMax, m - 1));
    return { partes: [m, "-", s], resposta: m - s };
  }
  if (op === "*") {
    const t = escolher(r.tabuadas ?? [2, 3, 4, 5]);
    const o = rint(r.outroMin ?? 2, r.outroMax ?? 10);
    const [a, b] = Math.random() < 0.5 ? [t, o] : [o, t];
    return { partes: [a, "*", b], resposta: a * b };
  }
  if (op === "/") {
    const d = escolher(r.divisores ?? [2, 3, 4, 5]);
    const q = rint(r.quocMin ?? 2, r.quocMax ?? 10);
    return { partes: [d * q, "/", d], resposta: q };
  }
  throw new Error("operação desconhecida: " + op);
}

function gerarTresParcelas(operacoes, regras) {
  const somaMax = regras["+"]?.somaMax ?? 50;
  let acc = rint(3, 18);
  const partes = [acc];
  for (let k = 0; k < 2; k++) {
    let op = escolher(operacoes.length ? operacoes : ["+", "-"]);
    if (op === "-" && acc <= 2) op = "+";
    if (op === "+") {
      let v = rint(2, 15);
      if (acc + v > somaMax) v = Math.max(1, somaMax - acc);
      acc += v;
      partes.push("+", v);
    } else {
      const v = rint(1, Math.min(12, acc));
      acc -= v;
      partes.push("-", v);
    }
  }
  return { partes, resposta: acc };
}

function textoDaConta(partes) {
  return partes.map((p) => (typeof p === "string" ? SINAL[p] : p)).join(" ") + " =";
}

/*
  Cria um gerador para a fase. Uso:
    const prox = criarGeradorDeFase(fase);
    const q = prox();  // { texto, resposta, respostaStr, slots }
*/
export function criarGeradorDeFase(fase) {
  const usadas = new Set();
  const parcelas = fase.parcelas ?? 2;

  return function proxima() {
    let conta = null;
    for (let tent = 0; tent < 40; tent++) {
      const cand =
        parcelas === 3
          ? gerarTresParcelas(fase.operacoes, fase.regras)
          : gerarSimples(escolher(fase.operacoes), fase.regras);
      const texto = textoDaConta(cand.partes);
      if (!usadas.has(texto) && cand.resposta >= 0 && cand.resposta <= 99) {
        usadas.add(texto);
        conta = { ...cand, texto };
        break;
      }
    }
    if (!conta) {
      const cand = gerarSimples(escolher(fase.operacoes), fase.regras);
      conta = { ...cand, texto: textoDaConta(cand.partes) };
    }
    const respostaStr = String(conta.resposta);
    return {
      texto: conta.texto,
      partes: conta.partes,
      resposta: conta.resposta,
      respostaStr,
      slots: respostaStr.length, // 1 ou 2
    };
  };
}

/*
  =========================================================================
  Math Kids — Dicas educativas ao errar (Épico 2, história 2.5)
  =========================================================================
  Gera a mensagem que aparece QUANDO A CRIANÇA ERRA. Regras do épico
  ("feedback educativo SEM conteúdo negativo"):

    1. nunca usa palavra negativa ("errado", "errou", "não") nem emoji triste;
    2. nunca entrega a resposta final — ensina o CAMINHO até ela;
    3. fica mais concreta a cada tentativa:
         nível 1 = estratégia ("separa em dezenas e unidades")
         nível 2 = um pedaço da conta já resolvido ("as dezenas dão 50")
    4. a dica sai da conta REAL da tela, não é um texto fixo da fase.

  API:
    dicaDeErro(questao, tentativasUsadas) -> string pronta pro #aviso
      questao        = objeto do js/gerador.js ({ partes, resposta, ... })
      tentativasUsadas = 1 na primeira vez que erra, 2 na segunda...
  =========================================================================
*/

const SINAL = { "+": "+", "-": "−", "*": "×", "/": "÷" };

/* Abertura sempre positiva — varia pra não ficar repetitivo na mesma fase. */
const ELOGIOS = [
  "Quase!",
  "Tá pertinho!",
  "Boa tentativa!",
  "Você tá no caminho!",
  "Faltou pouco!",
];

const dezenas = (n) => Math.floor(n / 10) * 10;
const unidades = (n) => n % 10;

/* ---------------------------------------------------------------- soma */
function dicaSoma(a, b, nivel) {
  if (a < 10 && b < 10) {
    return nivel === 1
      ? `Começa no ${a} e conta mais ${b}, um de cada vez.`
      : `Vale contar nos dedos a partir do ${a}. São ${b} dedinhos.`;
  }

  const da = dezenas(a), db = dezenas(b);
  const ua = unidades(a), ub = unidades(b);

  if (ua === 0 && ub === 0) {
    return nivel === 1
      ? `São dezenas certinhas: pensa em ${da / 10} + ${db / 10} e devolve o zero no fim.`
      : `${da / 10} + ${db / 10} = ${da / 10 + db / 10}. Agora põe o zero de volta.`;
  }

  // Só um dos dois tem dezena (ex.: 6 + 35): quebrar o número grande funciona
  // melhor do que falar em "dezenas (0 + 30)".
  if (da === 0 || db === 0) {
    const pequeno = Math.min(a, b);
    const grande = Math.max(a, b);
    const dg = dezenas(grande), ug = unidades(grande);
    if (ug === 0) {
      return `O ${grande} não tem unidades. É só encaixar o ${pequeno} no lugar do zero.`;
    }
    return nivel === 1
      ? `Quebra o ${grande} em ${dg} + ${ug}. Faz ${pequeno} + ${ug} primeiro e depois junta o ${dg}.`
      : `${pequeno} + ${ug} = ${pequeno + ug}. Agora junta o ${dg} nesse número.`;
  }

  // um dos dois é dezena redonda (ex.: 14 + 10): não existe "unidades (4 + 0)"
  if (ua === 0 || ub === 0) {
    const redondo = ua === 0 ? a : b;
    const outro = ua === 0 ? b : a;
    return nivel === 1
      ? `Somar ${redondo} mexe só nas dezenas: as unidades do ${outro} continuam iguais.`
      : `As dezenas dão ${da + db}. Agora é só devolver as ${unidades(outro)} unidades do ${outro}.`;
  }

  if (nivel === 1) {
    return `Separa em partes: primeiro as dezenas (${da} + ${db}), depois as unidades (${ua} + ${ub}).`;
  }
  return `As dezenas dão ${da + db}. Agora é só juntar ${ua} + ${ub} nesse número.`;
}

/* ----------------------------------------------------------- subtração */
function dicaSubtracao(m, s, nivel) {
  const um = unidades(m);
  const ds = dezenas(s), us = unidades(s);

  if (ds === 0) {
    if (nivel === 1) {
      // com s pequeno a sequência "m-1, m-2, m-3..." passaria da resposta
      if (s <= 3) return `Falta pouco: anda ${s} ${s === 1 ? "casinha" : "casinhas"} pra trás a partir do ${m}.`;
      return `Conta pra trás a partir do ${m}: ${m - 1}, ${m - 2}, ${m - 3}...`;
    }
    if (um >= s) {
      return `As dezenas do ${m} não mudam. É só fazer ${um} − ${s} nas unidades.`;
    }
    // um < s: precisa "pegar emprestado" de uma dezena.
    if (um === 0 && m > 10) {
      return `O ${m} é ${m - 10} + 10. Faz 10 − ${s} e junta o resultado com ${m - 10}.`;
    }
    if (um === 0) {
      return `Conta pra trás bem devagar a partir do ${m}: ${m - 1}, ${m - 2}, ${m - 3}...`;
    }
    return `Chega primeiro na dezena redonda: ${m} − ${um} = ${m - um}. Aí tira os ${s - um} que sobraram.`;
  }

  if (us === 0) {
    const dm = dezenas(m) / 10, dss = ds / 10;
    if (nivel === 1) {
      return `Só as dezenas mudam nessa conta: pensa em ${dm} − ${dss} dezenas.`;
    }
    if (dm - dss === 0) {
      return `Tirar ${ds} leva embora todas as dezenas do ${m}. Sobra só o que está nas unidades.`;
    }
    return `${dm} − ${dss} = ${dm - dss} dezenas. As unidades do ${m} ficam iguais.`;
  }

  return nivel === 1
    ? `Tira de pouquinho: primeiro ${m} − ${ds}, e só depois tira os ${us} que faltam.`
    : `${m} − ${ds} = ${m - ds}. Agora tira ${us} desse número.`;
}

/* ------------------------------------------------------- multiplicação */
function dicaMultiplicacao(a, b, nivel) {
  // o maior vira "o número", o menor vira "quantas vezes" — fica mais fácil de imaginar
  const n = Math.max(a, b);
  const vezes = Math.min(a, b);

  if (vezes === 1) return `Vezes 1 é o próprio número: continua sendo ${n}.`;
  if (vezes === 10) return `Vezes 10 é só colocar um zero no fim do ${n}.`;

  if (nivel === 1) {
    if (vezes === 2) return `Vezes 2 é o dobro: ${n} + ${n}.`;
    if (vezes === 5) return `Vezes 5 é a metade de vezes 10. ${n} × 10 = ${n * 10} — agora pega a metade.`;
    return `${n} × ${vezes} é o ${n} somado ${vezes} vezes: ${n} + ${n} + ${n}...`;
  }

  // vezes === 2 não tem "metade" útil (× 1 é o próprio número)
  if (vezes === 2) {
    return `Dobrar o ${n} é fazer ${n} + ${n}. Vai somando devagar.`;
  }
  if (vezes % 2 === 0) {
    return `Se ${n} × ${vezes / 2} = ${n * (vezes / 2)}, é só dobrar esse resultado.`;
  }
  return `${n} × ${vezes - 1} = ${n * (vezes - 1)}. Agora soma mais um ${n}.`;
}

/* -------------------------------------------------------------- divisão */
function dicaDivisao(n, d, nivel) {
  if (nivel === 1) {
    return `Quantos ${d} cabem em ${n}? Conta de ${d} em ${d}: ${d}, ${d * 2}, ${d * 3}...`;
  }
  return `Pensa ao contrário: ${d} × qual número dá ${n}?`;
}

/* ------------------------------------------- contas com três parcelas */
function dicaTresParcelas(partes, nivel) {
  const [a, op1, b, op2, c] = partes;
  const parcial = op1 === "+" ? a + b : a - b;
  if (nivel === 1) {
    return `Faz uma de cada vez, da esquerda pra direita. Começa só com ${a} ${SINAL[op1]} ${b}.`;
  }
  return `${a} ${SINAL[op1]} ${b} = ${parcial}. Agora falta só ${parcial} ${SINAL[op2]} ${c}.`;
}

/* ------------------------------------------------------------ despacho */
function estrategia(partes, nivel) {
  if (partes.length === 5) return dicaTresParcelas(partes, nivel);

  const [a, op, b] = partes;
  if (op === "+") return dicaSoma(a, b, nivel);
  if (op === "-") return dicaSubtracao(a, b, nivel);
  if (op === "*") return dicaMultiplicacao(a, b, nivel);
  if (op === "/") return dicaDivisao(a, b, nivel);
  return "Confere a conta com calma e tenta de novo.";
}

/*
  Monta a mensagem completa: elogio + 💡 + dica da conta.
  `tentativasUsadas` começa em 1 (primeiro erro da questão).
*/
export function dicaDeErro(questao, tentativasUsadas) {
  const nivel = tentativasUsadas >= 2 ? 2 : 1;
  const elogio = ELOGIOS[Math.floor(Math.random() * ELOGIOS.length)];
  let texto;
  try {
    texto = estrategia(questao.partes, nivel);
  } catch {
    texto = "Confere a conta com calma e tenta de novo."; // nunca deixa a criança sem resposta
  }
  return `${elogio} 💡 ${texto}`;
}

/*
  =========================================================================
  Math Kids — Teste das dicas educativas (js/dicas.js)
  =========================================================================
  Gera milhares de contas com o gerador real de TODAS as fases e confere
  que nenhuma dica quebra as regras do Épico 2 (história 2.5):

    - sem palavra negativa ("errado", "burro", "ruim"...)
    - sem NaN / undefined vazando pro texto
    - sem texto matematicamente degenerado ("50 − 0 = 50", "0 dezenas")
    - toda dica traz o 💡

  Uso:
      cd ferramentas
      node testar-dicas.mjs

  Sai com código 1 se achar qualquer falha (dá pra usar em CI).
  =========================================================================
*/
import { TODAS_FASES } from "../js/fases.js";
import { criarGeradorDeFase } from "../js/gerador.js";
import { dicaDeErro } from "../js/dicas.js";

const RODADAS_POR_FASE = 40;

const NEGATIVAS = /\b(errad|errou|erro\b|burr|péssim|ruim|falhou|perdeu|fraco|feio)/i;
const DEGENERADO = /[−×÷]\s*0\b|\b0\s*dezenas|junta o 0\b|em 0 \+|\+ 0\b/;

/* O verificador precisa provar que ainda pega os bugs que já foram corrigidos —
   senão um regex quebrado faz o teste passar sem testar nada. */
const REGRESSOES = [
  "Chega primeiro na dezena redonda: 50 − 0 = 50. Aí tira os 9 que sobraram.",
  "1 − 1 = 0 dezenas. As unidades do 19 ficam iguais.",
  "Separa em partes: primeiro as dezenas (10 + 10), depois as unidades (4 + 0).",
];
for (const [i, t] of REGRESSOES.entries()) {
  if (!DEGENERADO.test(t)) {
    console.error(`[FATAL] o verificador deixou de pegar a regressão #${i + 1}:\n  ${t}`);
    process.exit(2);
  }
}
console.log(`verificador OK (pega as ${REGRESSOES.length} regressões conhecidas)\n`);

let total = 0;
let falhas = 0;
const exemplos = [];

for (const fase of TODAS_FASES) {
  for (let rodada = 0; rodada < RODADAS_POR_FASE; rodada++) {
    const proxima = criarGeradorDeFase(fase);
    for (let i = 0; i < fase.qtdQuestoes; i++) {
      const q = proxima();
      for (const nivel of [1, 2]) {
        const d = dicaDeErro(q, nivel);
        total++;
        const erros = [];
        if (NEGATIVAS.test(d)) erros.push("PALAVRA NEGATIVA");
        if (/NaN|undefined|Infinity/.test(d)) erros.push("NaN/undefined");
        if (DEGENERADO.test(d)) erros.push("TEXTO DEGENERADO");
        if (!d.includes("💡")) erros.push("SEM 💡");
        if (erros.length) {
          falhas++;
          if (falhas <= 10) {
            console.log(`[!] fase ${fase.id} | ${q.texto} ${q.resposta} | nível ${nivel}`);
            console.log(`    ${d}`);
            console.log(`    -> ${erros.join(", ")}`);
          }
        }
      }
    }
  }

  const q = criarGeradorDeFase(fase)();
  exemplos.push(
    `fase ${String(fase.id).padStart(3)} | ${q.texto} ${q.resposta}\n` +
    `         1º erro: ${dicaDeErro(q, 1)}\n` +
    `         2º erro: ${dicaDeErro(q, 2)}`
  );
}

console.log("--- um exemplo por fase ---");
exemplos.forEach((e) => console.log("  " + e));
console.log("\n=================================");
console.log(`${total} dicas geradas | ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);

/*
  =========================================================================
  Math Kids — Instalador da logo da universidade
  =========================================================================
  Copia a imagem que você já baixou para img/ com o nome certo, sem você
  precisar navegar por pastas.

  USO:
      node ferramentas/instalar-logo.mjs "C:\\Users\\voce\\Downloads\\logo.png"

  Ou, sem argumento, ele procura a imagem mais recente em Downloads e na
  Área de Trabalho e pergunta se é essa:

      node ferramentas/instalar-logo.mjs

  Formatos aceitos: .svg (melhor), .png, .jpg/.jpeg
  =========================================================================
*/
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");
const DESTINO_DIR = path.join(RAIZ, "img");
const EXTS = [".svg", ".png", ".jpg", ".jpeg"];

function erro(msg) {
  console.error("\n  ❌ " + msg + "\n");
  process.exit(1);
}

/* Procura candidatos nas pastas onde um download costuma cair. */
function procurarCandidatos() {
  const casa = os.homedir();
  const pastas = [
    path.join(casa, "Downloads"),
    path.join(casa, "Desktop"),
    path.join(casa, "Pictures"),
    path.join(casa, "OneDrive", "Imagens"),
    path.join(casa, "OneDrive", "Área de Trabalho"),
  ];
  const achados = [];
  for (const p of pastas) {
    if (!fs.existsSync(p)) continue;
    let itens = [];
    try { itens = fs.readdirSync(p, { withFileTypes: true }); } catch { continue; }
    for (const it of itens) {
      if (!it.isFile()) continue;
      if (!EXTS.includes(path.extname(it.name).toLowerCase())) continue;
      const completo = path.join(p, it.name);
      try {
        achados.push({ caminho: completo, mtime: fs.statSync(completo).mtimeMs });
      } catch { /* sem permissão: ignora */ }
    }
  }
  // arquivos com nome sugestivo primeiro, depois os mais recentes
  const sugestivo = /cruzeiro|csul|unive|logo/i;
  return achados.sort((a, b) => {
    const sa = sugestivo.test(path.basename(a.caminho)) ? 1 : 0;
    const sb = sugestivo.test(path.basename(b.caminho)) ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return b.mtime - a.mtime;
  }).slice(0, 10);
}

function instalar(origem) {
  if (!fs.existsSync(origem)) erro("Não achei esse arquivo:\n     " + origem);
  if (fs.statSync(origem).isDirectory()) erro("Isso é uma pasta, não uma imagem:\n     " + origem);

  const ext = path.extname(origem).toLowerCase();
  if (!EXTS.includes(ext)) {
    erro(`Formato "${ext || "(sem extensão)"}" não serve.\n     Use um destes: ${EXTS.join(", ")}`);
  }

  const tamanho = fs.statSync(origem).size;
  if (tamanho === 0) erro("O arquivo está vazio (0 bytes).");

  if (!fs.existsSync(DESTINO_DIR)) fs.mkdirSync(DESTINO_DIR, { recursive: true });

  // remove versões antigas em outros formatos, senão a ordem de busca do
  // creditos.js poderia continuar pegando a logo velha
  for (const e of EXTS) {
    const antigo = path.join(DESTINO_DIR, "cruzeiro-do-sul" + e);
    if (fs.existsSync(antigo) && path.resolve(antigo) !== path.resolve(origem)) {
      fs.unlinkSync(antigo);
      console.log("  (removida logo anterior: cruzeiro-do-sul" + e + ")");
    }
  }

  const destino = path.join(DESTINO_DIR, "cruzeiro-do-sul" + ext);
  fs.copyFileSync(origem, destino);

  console.log("\n  ✅ Logo instalada!");
  console.log("     de:    " + origem);
  console.log("     para:  " + destino + `  (${(tamanho / 1024).toFixed(1)} KB)`);
  if (ext !== ".svg") {
    console.log("\n     Dica: se você tiver a versão .svg, ela fica melhor no projetor.");
  }
  console.log("\n  Agora recarregue o jogo (F5) e abra a tela de Créditos.\n");
}

const argumento = process.argv[2];
if (argumento) {
  instalar(path.resolve(argumento.replace(/^["']|["']$/g, "")));
} else {
  const cands = procurarCandidatos();
  if (!cands.length) {
    console.log("\n  Não achei nenhuma imagem em Downloads / Área de Trabalho / Imagens.");
    console.log("  Salve a logo primeiro e rode de novo, ou passe o caminho:");
    console.log('     node ferramentas/instalar-logo.mjs "C:\\caminho\\logo.png"\n');
    process.exit(0);
  }
  console.log("\n  Imagens encontradas:\n");
  cands.forEach((c, i) => console.log(`   [${i + 1}] ${c.caminho}`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("\n  Qual é a logo? (número, ou Enter para cancelar): ", (resp) => {
    rl.close();
    const n = Number(String(resp).trim());
    if (!n || n < 1 || n > cands.length) { console.log("\n  Cancelado.\n"); process.exit(0); }
    instalar(cands[n - 1].caminho);
  });
}

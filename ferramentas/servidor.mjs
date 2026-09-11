/*
  =========================================================================
  Math Kids — Servidor local de desenvolvimento
  =========================================================================
  POR QUE ISTO EXISTE:
  as telas do jogo usam <script type="module">. Abrindo o index.html com
  duplo-clique (protocolo file://) o navegador BLOQUEIA os imports por
  política de CORS:

      Access to script at 'file:///.../js/script.js' from origin 'null'
      has been blocked by CORS policy

  A página aparece, mas fica presa em "Carregando avatares...". Por isso o
  jogo precisa ser servido por HTTP.

  USO:
      node ferramentas/servidor.mjs        (ou dê duplo-clique em abrir-jogo.bat)

  Sem dependência nenhuma — só a biblioteca padrão do Node, no mesmo
  espírito "sem build" do resto do projeto. Serve a pasta do jogo (a que
  tem o index.html), acha uma porta livre e abre o navegador sozinho.
  =========================================================================
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// a raiz do site é a pasta ACIMA de ferramentas/ — nada de caminho fixo,
// então continua funcionando se o projeto for movido de lugar
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, "..");

const PORTA_INICIAL = Number(process.env.PORTA) || 5500;
const TENTATIVAS = 20;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const servidor = http.createServer((req, res) => {
  const semQuery = decodeURIComponent(req.url.split("?")[0]);
  const alvo = path.resolve(RAIZ, "." + (semQuery === "/" ? "/index.html" : semQuery));

  // nunca servir nada fora da pasta do jogo
  if (!alvo.startsWith(RAIZ) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("404 — não encontrado: " + semQuery);
  }

  res.writeHead(200, {
    "Content-Type": MIME[path.extname(alvo).toLowerCase()] || "application/octet-stream",
    // sempre recarregar: em desenvolvimento cache atrapalha mais do que ajuda
    "Cache-Control": "no-cache, no-store, must-revalidate",
  });
  res.end(fs.readFileSync(alvo));
});

/* Handlers registrados UMA vez. Passar a callback pro listen() a cada
   tentativa deixaria a callback da porta que falhou pendurada no evento
   "listening" — quando a porta seguinte desse certo, todas disparavam
   juntas (URL errada no console e navegador abrindo duas vezes). */
let porta = PORTA_INICIAL;
let restantes = TENTATIVAS;

servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE" && restantes > 0) {
    console.log(`porta ${porta} ocupada, tentando ${porta + 1}...`);
    restantes--;
    servidor.listen(++porta);
  } else {
    console.error("Não consegui subir o servidor:", e.message);
    process.exit(1);
  }
});

servidor.on("listening", () => {
  const url = `http://localhost:${servidor.address().port}/`;
  console.log("");
  console.log("  🧮 Math Kids rodando em " + url);
  console.log("  servindo: " + RAIZ);
  console.log("");
  console.log("  Deixe esta janela aberta enquanto joga.");
  console.log("  Ctrl+C para parar.");
  console.log("");
  // abre o navegador padrão (Windows / macOS / Linux)
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref(); } catch { /* abre na mão */ }
});

servidor.listen(porta);

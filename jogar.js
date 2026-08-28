/*
  =========================================================================
  Math Kids — Menu de fases (Sistema de Fases + Progressão)
  =========================================================================
  Mostra as 10 fases + 3 extras com estrelas e recorde de pontos.
  Regra de liberação em js/fases.js (faseLiberada).
  =========================================================================
*/
import { exigirSessao, limparSessao } from "./sessao.js";
import { faceSVG } from "./avatares.js";
import { carregarProgresso } from "./progresso.js";
import { FASES, FASES_EXTRAS, faseLiberada } from "./fases.js";

const sessao = exigirSessao();

document.getElementById("avatarFace").innerHTML =
  faceSVG(sessao.avatar.tipo, sessao.avatar.cor, sessao.avatar.accent);
document.getElementById("avatarNome").textContent = sessao.avatar.nome;

document.getElementById("btnSair").addEventListener("click", async () => {
  await limparSessao();
  location.href = "index.html";
});

const MAX_ESTRELAS = (FASES.length + FASES_EXTRAS.length) * 3;
document.getElementById("maxEstrelas").textContent = MAX_ESTRELAS;

let progresso = {};
try {
  progresso = await carregarProgresso(sessao.token);
} catch (e) {
  console.error("Erro ao carregar progresso:", e);
  if (String(e.message || "").includes("Sessão")) {
    await limparSessao();
    location.replace("index.html");
  }
}

function estrelasHTML(n) {
  let s = "";
  for (let i = 1; i <= 3; i++) s += `<span class="${i <= n ? "on" : "off"}">★</span>`;
  return s;
}

function cardFase(f) {
  const p = progresso[f.id];
  const liberada = faseLiberada(f.id, progresso);
  const el = document.createElement(liberada ? "a" : "div");
  el.className =
    "fase-card" + (liberada ? "" : " bloqueada") + (p && p.concluida ? " concluida" : "");
  if (liberada) {
    el.href = `partida.html?fase=${f.id}`;
    el.setAttribute("role", "link");
    el.tabIndex = 0;
  }
  el.innerHTML = `
    <span class="num">${f.extra ? "EXTRA" : "FASE " + f.id}</span>
    <span class="emoji" style="${liberada ? `background:${f.cor}` : ""}">${liberada ? f.emoji : "🔒"}</span>
    <span class="titulo">${f.nome}</span>
    <span class="estrelas">${estrelasHTML(p ? p.estrelas : 0)}</span>
    <span class="melhor">${
      p ? "Recorde: " + p.melhor_pontos + " pts" : liberada ? "Nova!" : "Bloqueada"
    }</span>
  `;
  return el;
}

const gridFases = document.getElementById("gridFases");
const gridExtras = document.getElementById("gridExtras");
FASES.forEach((f) => gridFases.appendChild(cardFase(f)));
FASES_EXTRAS.forEach((f) => gridExtras.appendChild(cardFase(f)));

const total = Object.values(progresso).reduce((s, p) => s + (p.estrelas || 0), 0);
document.getElementById("totalEstrelas").textContent = total;

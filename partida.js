/*
  =========================================================================
  Math Kids — Partida (Reconhecimento de escrita + Pontuação + Progressão)
  =========================================================================
  Fluxo de uma questão:
    1. gera a conta (js/gerador.js) e mostra N quadradinhos de resposta
    2. a criança desenha um dígito por vez no <canvas>
    3. "Conferir" -> reconhecimento (js/reconhecimento.js) preenche o
       quadrado ativo; se o modelo ficou em dúvida, pede pra reescrever
    4. com todos os quadrados preenchidos, compara com a resposta certa
    5. acerto: pontos + combo; erro: perde uma tentativa; sem tentativas
       ou tempo esgotado -> mostra a resposta e segue

  Ao terminar todas as questões, calcula estrelas e salva via
  salvar_resultado_fase (js/progresso.js).
  =========================================================================
*/
import { exigirSessao, limparSessao } from "./sessao.js";
import { carregarProgresso, salvarResultado } from "./progresso.js";
import { acharFase, faseLiberada, TODAS_FASES } from "./fases.js";
import { criarGeradorDeFase } from "./gerador.js";
import { criarReconhecedor } from "./reconhecimento.js";

const sessao = exigirSessao();

const faseId = Number(new URLSearchParams(location.search).get("fase"));
const fase = acharFase(faseId);
if (!fase) location.replace("jogar.html");

const $ = (id) => document.getElementById(id);
const carregando = $("carregando");

function erroFatal(msg) {
  carregando.classList.remove("some");
  carregando.innerHTML = `<p style="max-width:280px;text-align:center">${msg}</p>
    <button class="btn-sair" onclick="location.reload()">Tentar de novo</button>
    <button class="btn-sair" onclick="location.href='jogar.html'">Voltar ao mapa</button>`;
  throw new Error(msg);
}

/* ---- pré-condições: sessão válida + fase liberada + modelo carregado ---- */
let progresso = {};
try {
  progresso = await carregarProgresso(sessao.token);
} catch (e) {
  if (String(e.message || "").includes("Sessão")) {
    await limparSessao();
    location.replace("index.html");
  }
}
if (!faseLiberada(faseId, progresso)) location.replace("jogar.html");

let rec;
try {
  rec = await criarReconhecedor("js/modelo-mnist.json");
} catch (e) {
  console.error(e);
  erroFatal("Não consegui carregar o reconhecimento de escrita. Verifica a internet e recarrega.");
}
carregando.classList.add("some");

/* ---- estado ---- */
const gerar = criarGeradorDeFase(fase);
const totalQ = fase.qtdQuestoes;
let qIndex = 0;
let pontos = 0;
let combo = 0;
let comboMax = 0;
let acertos = 0;
let questao = null;
let valores = [];
let slotAtivo = 0;
let tentativasRestantes = fase.tentativas;
let travado = false;
let timer = null;
let tempoRestante = 0;

$("tituloFase").textContent = `${fase.emoji} ${fase.nome}`;

/* ---- canvas de desenho ---- */
const canvas = $("tela");
const telaWrap = $("telaWrap");
const ctx = canvas.getContext("2d");
ctx.lineWidth = 22;
ctx.lineCap = "round";
ctx.lineJoin = "round";
ctx.strokeStyle = "#14141A";
ctx.fillStyle = "#14141A";
let desenhando = false;
let temTraco = false;
let ultimo = null;

function coord(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (canvas.width / r.width),
    y: (e.clientY - r.top) * (canvas.height / r.height),
  };
}
function pdown(e) {
  if (travado) return;
  desenhando = true;
  temTraco = true;
  telaWrap.classList.add("tem-traco");
  ultimo = coord(e);
  ctx.beginPath();
  ctx.arc(ultimo.x, ultimo.y, ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.fill();
  try { canvas.setPointerCapture(e.pointerId); } catch {}
  atualizarBotao();
}
function pmove(e) {
  if (!desenhando) return;
  const p = coord(e);
  ctx.beginPath();
  ctx.moveTo(ultimo.x, ultimo.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ultimo = p;
}
function pup() { desenhando = false; }
canvas.addEventListener("pointerdown", pdown);
canvas.addEventListener("pointermove", pmove);
canvas.addEventListener("pointerup", pup);
canvas.addEventListener("pointercancel", pup);
window.addEventListener("pointerup", pup);

function limparCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  temTraco = false;
  desenhando = false;
  telaWrap.classList.remove("tem-traco");
  atualizarBotao();
}
function atualizarBotao() {
  $("btnConferir").disabled = !temTraco || travado;
}

$("btnApagar").addEventListener("click", () => { if (!travado) { limparCanvas(); aviso(""); } });
$("btnConferir").addEventListener("click", conferir);

/* teclado: apoio para o professor / acessibilidade (opcional) */
window.addEventListener("keydown", (e) => {
  if (travado || $("fimOverlay").classList.contains("aberto")) return;
  if (/^[0-9]$/.test(e.key)) { registrarDigito(Number(e.key)); }
  else if (e.key === "Backspace") { valores[slotAtivo] = ""; pintarSlots(); }
});

/* ---- slots de resposta ---- */
const slotsEl = $("slots");
function montarSlots(n) {
  slotsEl.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const d = document.createElement("div");
    d.className = "slot" + (i === 0 ? " ativo" : "");
    d.addEventListener("click", () => {
      if (travado) return;
      slotAtivo = i;
      marcarAtivo();
      limparCanvas();
    });
    slotsEl.appendChild(d);
  }
}
function pintarSlots() {
  [...slotsEl.children].forEach((el, i) => { el.textContent = valores[i] || ""; });
  marcarAtivo();
}
function marcarAtivo() {
  [...slotsEl.children].forEach((el, i) => el.classList.toggle("ativo", i === slotAtivo && !travado));
}
function marcarTodos(cls) {
  [...slotsEl.children].forEach((el) => { el.classList.remove("ativo"); el.classList.add(cls); });
}
function resetarSlots() {
  valores = Array(questao.slots).fill("");
  slotAtivo = 0;
  [...slotsEl.children].forEach((el) => { el.className = "slot"; el.textContent = ""; });
  marcarAtivo();
}
function mostrarResposta() {
  [...slotsEl.children].forEach((el, i) => {
    el.textContent = questao.respostaStr[i];
    el.classList.add("errado");
    el.classList.remove("ativo");
  });
}

/* ---- HUD ---- */
function aviso(msg, tipo) {
  const el = $("aviso");
  el.textContent = msg;
  el.className = "aviso" + (tipo ? " " + tipo : "");
}
function atualizarHUD() {
  $("pontos").textContent = pontos;
  $("chipQuestao").textContent = `${Math.min(qIndex + 1, totalQ)}/${totalQ}`;
  $("barraProg").style.width = `${(qIndex / totalQ) * 100}%`;
  const cc = $("chipCombo");
  if (combo >= 2) { cc.hidden = false; $("combo").textContent = combo; } else cc.hidden = true;
}
function atualizarVidas() {
  const usadas = fase.tentativas - tentativasRestantes;
  $("chipVidas").textContent = "❤".repeat(tentativasRestantes) + "🤍".repeat(Math.max(0, usadas));
}

/* ---- cronômetro (fases extras) ---- */
function pararTimer() { if (timer) { clearInterval(timer); timer = null; } }
function iniciarTimer() {
  pararTimer();
  if (!(fase.tempo > 0)) return;
  tempoRestante = fase.tempo;
  $("barraTempoWrap").hidden = false;
  desenharBarraTempo();
  timer = setInterval(() => {
    tempoRestante = Math.max(0, tempoRestante - 0.1);
    desenharBarraTempo();
    if (tempoRestante <= 0) { pararTimer(); estourouTempo(); }
  }, 100);
}
function desenharBarraTempo() {
  const frac = fase.tempo > 0 ? tempoRestante / fase.tempo : 0;
  $("barraTempo").style.width = `${frac * 100}%`;
  $("barraTempoWrap").classList.toggle("baixo", frac < 0.35);
}
function estourouTempo() {
  if (travado) return;
  travado = true;
  combo = 0;
  marcarAtivo();
  aviso(`Tempo! A resposta era ${questao.respostaStr}.`, "ruim");
  mostrarResposta();
  atualizarHUD();
  setTimeout(proximaQuestao, 1500);
}

/* ---- ciclo de questões ---- */
function carregarQuestao() {
  questao = gerar();
  valores = Array(questao.slots).fill("");
  slotAtivo = 0;
  tentativasRestantes = fase.tentativas;
  travado = false;
  $("conta").textContent = questao.texto;
  montarSlots(questao.slots);
  atualizarVidas();
  atualizarHUD();
  limparCanvas();
  aviso(fase.dica || "");
  iniciarTimer();
}

function registrarDigito(d) {
  if (travado) return;
  valores[slotAtivo] = String(d);
  pintarSlots();
  limparCanvas();
  aviso("");
  if (slotAtivo < questao.slots - 1) {
    slotAtivo++;
    marcarAtivo();
  } else {
    avaliar();
  }
}

function conferir() {
  if (travado || !temTraco) return;
  travado = true;
  $("btnConferir").disabled = true;
  const r = rec.classificar(canvas);
  travado = false;
  if (r.vazio) {
    aviso("Desenha um número primeiro 🙂", "ruim");
    atualizarBotao();
    return;
  }
  if (r.incerto) {
    aviso("Hmm, não deu pra ler. Capricha e escreve mais gordo!", "ruim");
    atualizarBotao();
    return;
  }
  registrarDigito(r.digito);
}

function pontosDoAcerto() {
  const usou = fase.tentativas - tentativasRestantes; // 0 = acertou de primeira
  const base = [100, 60, 30][Math.min(usou, 2)] ?? 20;
  const bonusCombo = 10 * Math.min(combo, 8);
  const bonusTempo = fase.tempo > 0 ? Math.round((tempoRestante / fase.tempo) * 40) : 0;
  return base + bonusCombo + bonusTempo;
}

function avaliar() {
  pararTimer();
  travado = true;
  const dado = valores.join("");
  if (dado === questao.respostaStr) {
    const ganho = pontosDoAcerto();
    pontos += ganho;
    combo++;
    comboMax = Math.max(comboMax, combo);
    acertos++;
    marcarTodos("certo");
    aviso(`Boa! +${ganho} pontos`, "bom");
    atualizarHUD();
    setTimeout(proximaQuestao, 900);
    return;
  }
  combo = 0;
  tentativasRestantes--;
  atualizarVidas();
  atualizarHUD();
  marcarTodos("errado");
  if (tentativasRestantes > 0) {
    aviso("Quase! Confere a conta e tenta de novo.", "ruim");
    setTimeout(() => {
      resetarSlots();
      travado = false;
      iniciarTimer();
    }, 1000);
  } else {
    aviso(`A resposta era ${questao.respostaStr}. Bora pra próxima!`, "ruim");
    mostrarResposta();
    setTimeout(proximaQuestao, 1700);
  }
}

function proximaQuestao() {
  qIndex++;
  if (qIndex >= totalQ) { finalizarFase(); return; }
  carregarQuestao();
}

/* ---- fim de fase ---- */
function calcularEstrelas() {
  const razao = acertos / totalQ;
  if (razao >= fase.meta.tres) return 3;
  if (razao >= fase.meta.duas) return 2;
  if (razao >= fase.meta.uma) return 1;
  return 0;
}

function proximaFaseId() {
  if (faseId < 10) return faseId + 1;
  const extras = TODAS_FASES.filter((f) => f.extra).map((f) => f.id);
  if (faseId === 10) return extras[0] ?? null;
  const i = extras.indexOf(faseId);
  return i >= 0 && i < extras.length - 1 ? extras[i + 1] : null;
}

async function finalizarFase() {
  pararTimer();
  travado = true;
  const estrelas = calcularEstrelas();

  $("fimTitulo").textContent =
    estrelas >= 1 ? "Fase concluída! 🎉" : "Fim da fase — quase lá!";
  $("fimEstrelas").innerHTML = [1, 2, 3]
    .map((i) => `<span class="${i <= estrelas ? "on" : "off"}">★</span>`)
    .join("");
  $("fimNumeros").innerHTML = `
    <div class="box"><b>${acertos}/${totalQ}</b>acertos</div>
    <div class="box"><b>${pontos}</b>pontos</div>
    <div class="box"><b>${comboMax}</b>melhor combo</div>
  `;

  const anterior = progresso[faseId];
  const recorde = !anterior || pontos > anterior.melhor_pontos;

  const acoes = $("fimAcoes");
  acoes.innerHTML = "";
  const prox = proximaFaseId();
  if (estrelas >= 1 && prox) {
    acoes.appendChild(botao("Próxima fase ➡", "primaria", () => location.href = `partida.html?fase=${prox}`));
  }
  acoes.appendChild(botao("Jogar de novo 🔁", estrelas >= 1 && prox ? "secundaria" : "primaria", () => location.reload()));
  acoes.appendChild(botao("Voltar ao mapa 🗺", "secundaria", () => location.href = "jogar.html"));

  $("salvoAviso").textContent = "Salvando progresso...";
  $("fimOverlay").classList.add("aberto");

  try {
    const r = await salvarResultado(sessao.token, faseId, { pontos, estrelas, acertos, total: totalQ });
    $("salvoAviso").textContent = r && r.offline
      ? "Progresso salvo neste dispositivo ✔"
      : recorde ? "Novo recorde salvo! ✔" : "Progresso salvo ✔";
  } catch (e) {
    console.error("Falha ao salvar resultado:", e);
    $("salvoAviso").textContent = "Não deu pra salvar agora — o professor pode tentar recarregar.";
  }
}

function botao(txt, cls, onClick) {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = txt;
  b.addEventListener("click", onClick);
  return b;
}

/* ---- sair ---- */
$("btnVoltar").addEventListener("click", () => {
  if ($("fimOverlay").classList.contains("aberto")) { location.href = "jogar.html"; return; }
  if (confirm("Sair da fase? O progresso desta partida será perdido.")) {
    location.href = "jogar.html";
  }
});

/* ---- começa ---- */
carregarQuestao();

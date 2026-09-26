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
    5. acerto: pontos + combo; erro: perde uma tentativa e recebe uma DICA
       educativa da conta (js/dicas.js); sem tentativas ou tempo esgotado
       -> mostra a resposta e segue

  A criança pode responder de dois jeitos (botões "Desenhar" / "Números"):
  desenhando na lousa ou tocando no teclado numérico da tela. A escolha
  fica salva em localStorage.

  Ao terminar todas as questões, calcula estrelas e salva via
  salvar_resultado_fase (js/progresso.js).

  Épico 3: as contas não nascem mais aqui. Quem entrega a fase e a lista de
  problemas é js/conteudo.js, que busca no Supabase e só cai no gerador
  local se o banco não responder. Cada problema pode vir com uma historinha
  do dia a dia (`enunciado`) e uma ilustração (`visual.emoji`), mostradas
  acima da conta.
  =========================================================================
*/
import { exigirSessao, limparSessao } from "./sessao.js";
import { salvarResultado } from "./progresso.js";
import {
  carregarConteudoDaFase,
  criarFonteDeProblemas,
  lembrarServidos,
  ultimosServidos,
  listarFasesComStatus,
} from "./conteudo.js";
import { criarReconhecedor } from "./reconhecimento.js";
import { dicaDeErro } from "./dicas.js";

const sessao = exigirSessao();

const faseId = Number(new URLSearchParams(location.search).get("fase"));

const $ = (id) => document.getElementById(id);
const carregando = $("carregando");

function erroFatal(msg) {
  carregando.classList.remove("some");
  carregando.innerHTML = `<p style="max-width:280px;text-align:center">${msg}</p>
    <button class="btn-sair" onclick="location.reload()">Tentar de novo</button>
    <button class="btn-sair" onclick="location.href='jogar.html'">Voltar ao mapa</button>`;
  throw new Error(msg);
}

/* Sai da página sem deixar o resto do módulo rodar com dado pela metade.
   `location.replace` só agenda a navegação — sem o throw, o código abaixo
   continuaria executando contra uma fase inexistente. */
function sairPara(url) {
  location.replace(url);
  throw new Error("Saindo da partida: " + url);
}

/* ---- pré-condições: sessão + conteúdo da fase + modelo carregado ---- */
$("carregandoTexto").textContent = "Buscando os problemas...";

/* A trilha inteira serve para descobrir qual é a próxima fase pela `ordem`
   do banco (e não por um "faseId + 1" chutado no front). */
const [conteudo, trilha] = await Promise.all([
  carregarConteudoDaFase(faseId, {
    token: sessao.token,
    excluir: ultimosServidos(faseId), // não repete os problemas da rodada passada
  }),
  listarFasesComStatus(sessao.token),
]);

if (conteudo.erro && String(conteudo.erro).includes("Sessão")) {
  await limparSessao();
  sairPara("index.html");
}

const fase = conteudo.fase;
if (!fase) sairPara("jogar.html");

/* Redundância do bloqueio: o servidor já recusa salvar progresso de fase
   bloqueada (história 5.2), mas não faz sentido deixar a criança jogar uma
   partida inteira que não vai contar. */
if (fase.status === "bloqueada") sairPara("jogar.html");

if (conteudo.erro) console.warn("Conteúdo: usando gerador local.", conteudo.erro);
conteudo.avisos.forEach((a) => console.warn("Conteúdo:", a));

$("carregandoTexto").textContent = "Preparando os desafios...";

let rec;
try {
  rec = await criarReconhecedor("js/modelo-mnist.json");
} catch (e) {
  console.error(e);
  erroFatal("Não consegui carregar o reconhecimento de escrita. Verifica a internet e recarrega.");
}
carregando.classList.add("some");

/* ---- estado ---- */
/* A fonte decide a ORDEM em que a criança vê os problemas: sem repetir
   problema, sem duas operações iguais seguidas e completando com o gerador
   local se o acervo do banco acabar (história 5.3). */
const fonte = criarFonteDeProblemas(fase, conteudo.problemas);
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

/* Ponto único de trava da questão. Passa por aqui pra que a lousa E o
   teclado da tela fiquem desabilitados juntos — senão a criança toca
   numa tecla durante a animação de feedback e nada acontece. */
function setTravado(v) {
  travado = v;
  atualizarBotao();
  atualizarTeclado();
}

$("btnApagar").addEventListener("click", () => { if (!travado) { limparCanvas(); aviso(""); } });
$("btnConferir").addEventListener("click", conferir);

/* teclado físico: apoio para o professor / acessibilidade (opcional) */
window.addEventListener("keydown", (e) => {
  if (travado || $("fimOverlay").classList.contains("aberto")) return;
  if (/^[0-9]$/.test(e.key)) { registrarDigito(Number(e.key)); }
  else if (e.key === "Backspace") { valores[slotAtivo] = ""; pintarSlots(); }
});

/* ---- teclado numérico NA TELA (alternativa ao desenho) ----
   Num tablet, o teclado físico acima não existe: sem isto, a criança que
   ainda não desenha firme fica sem jeito de responder. */
const CHAVE_MODO = "mathkids.modoResposta";
const tecladoNum = $("tecladoNum");
const areaDesenho = $("areaDesenho");
const areaTeclado = $("areaTeclado");
const btnModoDesenho = $("btnModoDesenho");
const btnModoTeclado = $("btnModoTeclado");

function montarTeclado() {
  const criar = (txt, cls, onClick, rotulo) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tecla-num" + (cls ? " " + cls : "");
    b.textContent = txt;
    if (rotulo) b.setAttribute("aria-label", rotulo);
    b.addEventListener("click", onClick);
    tecladoNum.appendChild(b);
    return b;
  };
  for (let d = 1; d <= 9; d++) criar(String(d), "", () => registrarDigito(d));
  criar("⌫", "apagar", apagarDigito, "Apagar o número");
  criar("0", "zero", () => registrarDigito(0));
}

function apagarDigito() {
  if (travado) return;
  valores[slotAtivo] = "";
  pintarSlots();
  aviso("");
}

function atualizarTeclado() {
  [...tecladoNum.children].forEach((b) => { b.disabled = travado; });
}

function aplicarModo(modo, salvar) {
  const desenho = modo !== "teclado";
  areaDesenho.hidden = !desenho;
  areaTeclado.hidden = desenho;
  btnModoDesenho.setAttribute("aria-pressed", String(desenho));
  btnModoTeclado.setAttribute("aria-pressed", String(!desenho));
  if (desenho) limparCanvas();
  if (salvar) {
    try { localStorage.setItem(CHAVE_MODO, desenho ? "desenho" : "teclado"); } catch { /* aba privada */ }
  }
}

btnModoDesenho.addEventListener("click", () => aplicarModo("desenho", true));
btnModoTeclado.addEventListener("click", () => aplicarModo("teclado", true));

montarTeclado();
let modoSalvo = "desenho";
try { modoSalvo = localStorage.getItem(CHAVE_MODO) || "desenho"; } catch { /* aba privada */ }
aplicarModo(modoSalvo, false);

/* ---- slots de resposta ---- */
const slotsEl = $("slots");
function montarSlots(n) {
  slotsEl.innerHTML = "";
  for (let i = 0; i < n; i++) {
    // <button> em vez de <div>: dá foco por teclado e leitura por leitor de tela de graça
    const d = document.createElement("button");
    d.type = "button";
    d.className = "slot" + (i === 0 ? " ativo" : "");
    d.setAttribute("aria-label", n === 1 ? "Sua resposta" : `Algarismo ${i + 1} de ${n}`);
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
function atualizarVidas(perdeu) {
  const usadas = fase.tentativas - tentativasRestantes;
  const chip = $("chipVidas");
  chip.textContent = "❤".repeat(tentativasRestantes) + "🤍".repeat(Math.max(0, usadas));
  if (perdeu) {
    // reinicia a animação: sem o reflow o navegador ignora a re-adição da classe
    chip.classList.remove("perdeu");
    void chip.offsetWidth;
    chip.classList.add("perdeu");
  } else {
    chip.classList.remove("perdeu");
  }
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
  setTravado(true);
  combo = 0;
  marcarAtivo();
  aviso(`Tempo! A resposta era ${questao.respostaStr}.`, "ruim");
  mostrarResposta();
  atualizarHUD();
  setTimeout(proximaQuestao, 1500);
}

/* ---- contexto da questão (história 5.3) ----
   Problema do banco vem com uma historinha do dia a dia e uma ilustração.
   Problema do gerador local não tem enunciado — aí a faixa some inteira,
   em vez de aparecer vazia. */
function mostrarContexto(q) {
  const caixa = $("contexto");
  const texto = (q.enunciado || "").trim();
  if (!texto) {
    caixa.hidden = true;
    $("enunciado").textContent = "";
    $("ilustracao").textContent = "";
    return;
  }
  $("enunciado").textContent = texto;
  $("ilustracao").textContent = q.visual?.emoji || "";
  caixa.hidden = false;
}

/* ---- ciclo de questões ---- */
function carregarQuestao() {
  questao = fonte.proxima();
  valores = Array(questao.slots).fill("");
  slotAtivo = 0;
  tentativasRestantes = fase.tentativas;
  setTravado(false);
  mostrarContexto(questao);
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
  setTravado(true);
  $("btnConferir").disabled = true;
  const r = rec.classificar(canvas);
  setTravado(false);
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
  setTravado(true);
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
  atualizarVidas(true);
  atualizarHUD();
  marcarTodos("errado");
  if (tentativasRestantes > 0) {
    // Dica educativa tirada da conta que está na tela (história 2.5):
    // ensina o caminho sem entregar a resposta, e fica mais concreta na 2ª vez.
    const usadas = fase.tentativas - tentativasRestantes;
    aviso(dicaDeErro(questao, usadas), "dica");
    setTimeout(() => {
      resetarSlots();
      setTravado(false);
      iniciarTimer();
    }, 1600);
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

/* A próxima fase é a seguinte na `ordem` do banco — cadastrar uma fase nova
   no Supabase entra na trilha sozinha, sem mexer aqui. Só se a trilha não
   veio é que caímos no "id + 1" de antes. */
function proximaFaseId() {
  const lista = (trilha.fases || []).slice().sort((a, b) => a.ordem - b.ordem);
  const i = lista.findIndex((f) => f.id === faseId);
  if (i >= 0 && i < lista.length - 1) return lista[i + 1].id;
  if (i >= 0) return null; // era a última da trilha
  return faseId < 10 ? faseId + 1 : null;
}

async function finalizarFase() {
  pararTimer();
  setTravado(true);
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

  /* Guarda os problemas que a criança acabou de ver: na próxima vez que ela
     jogar esta fase, eles entram em `p_excluir` e o banco sorteia outros
     (história 5.3 — não-repetição imediata). */
  lembrarServidos(faseId, fonte.servidos());

  const recorde = pontos > (fase.melhor_pontos || 0);

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
  // leva o foco pro cartão: sem isto o teclado/leitor de tela continua atrás do overlay
  $("fimTitulo").focus();

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

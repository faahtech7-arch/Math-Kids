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

  Ao terminar todas as questões, mostra estrelas, medalha e conquistas
  novas e manda o resultado para o banco (js/progresso.js).

  Épico 3: as contas não nascem mais aqui. Quem entrega a fase e a lista de
  problemas é js/conteudo.js, que busca no Supabase e só cai no gerador
  local se o banco não responder. Cada problema pode vir com uma historinha
  do dia a dia (`enunciado`) e uma ilustração (`visual.emoji`), mostradas
  acima da conta.

  Épico 4: pontuação, tempo e recompensas.
    6.1  o placar usa a regra de js/pontuacao.js (espelho da que mora no
         banco) e cresce à vista a cada acerto; erro nunca tira ponto;
    6.3  cada questão deixa um registro { t, e, r } em `respostas` e o
         relógio da fase mede o tempo jogado — é isso que vai para
         registrar_resultado_fase, que refaz a conta no servidor;
    6.2 / 6.4  a tela de fim mostra a medalha da partida e as conquistas
         que ela desbloqueou;
    6.6  o 🏆 do topo abre a Galeria de Conquistas por cima da partida,
         pausando o cronômetro, sem trocar de página.
  =========================================================================
*/
import { exigirSessao, limparSessao } from "./sessao.js";
import { registrarResultado } from "./progresso.js";
import {
  carregarConteudoDaFase,
  criarFonteDeProblemas,
  lembrarServidos,
  ultimosServidos,
  listarFasesComStatus,
} from "./conteudo.js";
import { criarReconhecedor } from "./reconhecimento.js";
import { dicaDeErro } from "./dicas.js";
import {
  pontosDoAcerto,
  decimosRestantes,
  calcularPartida,
  calcularEstrelas,
  acertosParaEstrelas,
} from "./pontuacao.js";
import {
  NIVEIS,
  ORDEM_DOS_NIVEIS,
  medalhaSVG,
  nivelDaRecompensa,
  formatarPontos,
} from "./recompensas.js";
import { criarGaleria, iconeDaConquista } from "./galeria.js";

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
let questao = null;
let valores = [];
let slotAtivo = 0;
let tentativasRestantes = fase.tentativas;
let travado = false;
let timer = null;
let tempoRestante = 0;
let pausado = false;  // Galeria de Conquistas aberta por cima da partida
let terminou = false; // a tela de fim de fase já apareceu

/* Épico 4 (história 6.3): um registro por questão, na ordem em que foram
   jogadas — { t, e, r }, formato explicado em js/pontuacao.js. É este
   array que vai para registrar_resultado_fase, e é dele que o servidor
   refaz pontos, acertos, erros e combo. */
const respostas = [];

/* Relógio da fase: o tempo JOGANDO, em segundos. Só anda com a partida na
   frente da criança — galeria aberta, aba escondida ou fase terminada
   param a contagem (ver sincronizarRelogio). */
const relogio = (() => {
  let acumulado = 0; // ms já contados
  let desde = null;  // início do trecho em andamento
  return {
    andar() { if (desde === null) desde = performance.now(); },
    parar() { if (desde !== null) { acumulado += performance.now() - desde; desde = null; } },
    segundos() {
      const correndo = desde === null ? 0 : performance.now() - desde;
      return Math.round((acumulado + correndo) / 1000);
    },
  };
})();

function sincronizarRelogio() {
  if (pausado || terminou || document.hidden) relogio.parar();
  else relogio.andar();
}
document.addEventListener("visibilitychange", sincronizarRelogio);

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
  if (travado || pausado || $("fimOverlay").classList.contains("aberto")) return;
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
/* Liga a contagem a partir do tempo que SOBROU — é o que deixa pausar
   (galeria aberta) e retomar do mesmo ponto. */
function ligarTimer() {
  pararTimer();
  if (!(fase.tempo > 0) || pausado) return;
  timer = setInterval(() => {
    tempoRestante = Math.max(0, tempoRestante - 0.1);
    desenharBarraTempo();
    if (tempoRestante <= 0) { pararTimer(); estourouTempo(); }
  }, 100);
}
function iniciarTimer() {
  pararTimer();
  if (!(fase.tempo > 0)) return;
  tempoRestante = fase.tempo;
  $("barraTempoWrap").hidden = false;
  desenharBarraTempo();
  ligarTimer();
}
function desenharBarraTempo() {
  const frac = fase.tempo > 0 ? tempoRestante / fase.tempo : 0;
  $("barraTempo").style.width = `${frac * 100}%`;
  $("barraTempoWrap").classList.toggle("baixo", frac < 0.35);
}
function estourouTempo() {
  if (travado) return;
  setTravado(true);
  // o tempo estourado conta como um erro a mais nesta questão
  respostas.push({ t: 0, e: fase.tentativas - tentativasRestantes + 1, r: 0 });
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

/* História 6.1 — o placar cresce À VISTA a cada acerto: o chip dá um pulo
   e o ganho sobe flutuando. Ao errar nada disto roda, porque o placar não
   muda (erro nunca tira ponto). */
function comemorarGanho(ganho) {
  const chip = $("chipPontos");
  chip.classList.remove("ganhou");
  void chip.offsetWidth; // reflow: sem ele a animação não recomeça
  chip.classList.add("ganhou");
  chip.querySelectorAll(".ganho-flutuante").forEach((el) => el.remove());
  const voa = document.createElement("span");
  voa.className = "ganho-flutuante";
  voa.setAttribute("aria-hidden", "true"); // o "+N pontos" já é anunciado pelo aviso
  voa.textContent = `+${ganho}`;
  voa.addEventListener("animationend", () => voa.remove());
  chip.appendChild(voa);
}

function avaliar() {
  pararTimer();
  setTravado(true);
  const dado = valores.join("");
  const jaErrou = fase.tentativas - tentativasRestantes; // 0 = está na primeira tentativa
  if (dado === questao.respostaStr) {
    const tentativa = jaErrou + 1;
    const restante = fase.tempo > 0 ? decimosRestantes(tempoRestante) : 0;
    // a mesma conta que o servidor refaz ao salvar (js/pontuacao.js)
    const ganho = pontosDoAcerto({ tentativa, combo, restanteDecimos: restante, tempoSeg: fase.tempo });
    respostas.push({ t: tentativa, e: jaErrou, r: restante });
    pontos += ganho;
    combo++;
    marcarTodos("certo");
    aviso(`Boa! +${ganho} pontos`, "bom");
    atualizarHUD();
    comemorarGanho(ganho);
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
    respostas.push({ t: 0, e: fase.tentativas, r: 0 }); // gastou todas as tentativas
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

/* ---- pausa: Galeria de Conquistas no meio da partida (história 6.6) ----
   A galeria abre por cima do jogo, sem trocar de página. Enquanto está
   aberta, nem o cronômetro da conta nem o relógio da fase andam.
   De propósito SEM `aoSessaoExpirada`: sessão vencida no meio da fase não
   expulsa a criança — a galeria mostra o que está neste dispositivo e o
   login é pedido só na próxima troca de tela. */
function pausar() {
  pausado = true;
  pararTimer();
  sincronizarRelogio();
}
function retomar() {
  pausado = false;
  sincronizarRelogio();
  // só existe contagem correndo com a questão aberta para resposta
  if (!travado && !terminou) ligarTimer();
}

const galeria = criarGaleria({
  token: sessao.token,
  rotuloVoltar: "Voltar ao jogo",
  aoAbrir: pausar,
  aoFechar: retomar,
});
$("btnTrofeu").addEventListener("click", () => galeria.abrir());
$("btnFimConquistas").addEventListener("click", () => galeria.abrir());

/* ---- fim de fase ---- */

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

/* O texto ao lado da medalha: o que falta para a próxima, contado em
   ACERTOS — é a única meta que a criança consegue mirar. Quem já tinha uma
   medalha melhor nesta fase ouve que ela continua guardada (repetir uma
   fase nunca piora o que está salvo). */
function recadoDaMedalha(p) {
  const guardada = nivelDaRecompensa(fase.estrelas);
  if (guardada && fase.estrelas > p.estrelas) {
    return `Sua ${NIVEIS[guardada].nome.toLowerCase()} desta fase continua guardada.`;
  }
  if (p.estrelas >= 3) return "É a medalha mais alta desta fase!";
  const proxima = ORDEM_DOS_NIVEIS[p.estrelas]; // 0 estrelas -> bronze, 1 -> prata, 2 -> ouro
  const alvo = acertosParaEstrelas(p.estrelas + 1, p.total, fase.meta);
  if (alvo === null) return "";
  return `Acerte ${alvo} de ${p.total} para ganhar a de ${NIVEIS[proxima].curto.toLowerCase()}.`;
}

/* Medalha da partida (história 6.2). Ela sai das estrelas — bronze, prata e
   ouro são 1, 2 e 3 — então as duas nunca se contradizem na tela. */
function pintarMedalha(p) {
  const caixa = $("fimMedalha");
  const guardada = nivelDaRecompensa(fase.estrelas);
  if (p.nivel) {
    caixa.className = `fim-medalha ganhou ${p.nivel}`; // "ganhou" liga a animação de chegada
    $("fimMedalhaDesenho").innerHTML = medalhaSVG(p.nivel);
    $("fimMedalhaNome").textContent = `${NIVEIS[p.nivel].nome}!`;
  } else {
    // sem medalha nesta partida: mostra a que já está guardada, ou a que espera por ela
    caixa.className = "fim-medalha";
    $("fimMedalhaDesenho").innerHTML = medalhaSVG(guardada);
    $("fimMedalhaNome").textContent = guardada ? "Sem medalha nova desta vez" : "Sua medalha está esperando";
  }
  $("fimMedalhaMeta").textContent = recadoDaMedalha(p);
  caixa.hidden = false;
}

function pintarResultado(p) {
  $("fimTitulo").textContent =
    p.estrelas >= 1 ? "Fase concluída! 🎉" : "Fim da fase — quase lá!";
  const estrelas = $("fimEstrelas");
  estrelas.setAttribute("role", "img");
  estrelas.setAttribute("aria-label", `${p.estrelas} de 3 estrelas`);
  estrelas.replaceChildren(...[1, 2, 3].map((i) => {
    const estrela = document.createElement("span");
    estrela.className = i <= p.estrelas ? "on" : "off";
    estrela.textContent = "★";
    return estrela;
  }));
  pintarMedalha(p);
  $("fimNumeros").replaceChildren(
    caixaDeNumero(`${p.acertos}/${p.total}`, "acertos"),
    caixaDeNumero(formatarPontos(p.pontos), "pontos"),
    caixaDeNumero(p.melhorCombo, "melhor combo")
  );
}

function caixaDeNumero(valor, legenda) {
  const caixa = document.createElement("div");
  caixa.className = "box";
  const numero = document.createElement("b");
  numero.textContent = valor;
  caixa.append(numero, legenda);
  return caixa;
}

/* Conquistas desbloqueadas por ESTA partida (história 6.4). Nome e descrição
   vêm do banco, então entram por textContent, nunca por innerHTML. */
function pintarConquistas(novas) {
  const caixa = $("fimConquistas");
  const lista = $("fimConquistasLista");
  lista.replaceChildren();
  if (!novas.length) { caixa.hidden = true; return; }
  caixa.hidden = false;
  $("fimConquistasTitulo").textContent =
    novas.length === 1 ? "Nova conquista! 🎉" : `${novas.length} novas conquistas! 🎉`;
  for (const c of novas) {
    const li = document.createElement("li");
    li.className = "fim-conquista";
    const texto = document.createElement("div");
    const nome = document.createElement("b");
    nome.textContent = c.nome;
    const descricao = document.createElement("small");
    descricao.textContent = c.descricao;
    texto.append(nome, descricao);
    li.append(iconeDaConquista(c, false), texto);
    lista.appendChild(li);
  }
}

function montarAcoes(estrelas) {
  const acoes = $("fimAcoes");
  acoes.replaceChildren();
  const prox = proximaFaseId();
  const avanca = estrelas >= 1 && prox;
  if (avanca) {
    acoes.appendChild(botao("Próxima fase ➡", "primaria", () => sairDaFase(`partida.html?fase=${prox}`)));
  }
  acoes.appendChild(botao("Jogar de novo 🔁", avanca ? "secundaria" : "primaria", () => sairDaFase(null)));
  acoes.appendChild(botao("Voltar ao mapa 🗺", "secundaria", () => sairDaFase("jogar.html")));
}

/* Sair da tela de fim espera a gravação terminar, com teto. Navegar no meio
   do envio cancelaria a requisição, e a fase seguinte continuaria bloqueada
   no servidor. O teto é o que garante que rede lenta nunca prende a criança
   — a essa altura o resultado já está no espelho deste dispositivo. */
const ESPERA_MAXIMA_MS = 4000;
let salvamento = Promise.resolve();
let saindo = false;

async function sairDaFase(url) {
  if (saindo) return;
  saindo = true;
  await Promise.race([salvamento, new Promise((ok) => setTimeout(ok, ESPERA_MAXIMA_MS))]);
  if (url) location.href = url;
  else location.reload(); // jogar de novo
}

/* Envia o resultado (história 6.3). registrarResultado nunca lança e nunca
   trava: sem servidor, o resultado fica neste dispositivo e a tela avisa. */
async function salvar(local) {
  try {
    const r = await registrarResultado(sessao.token, faseId, local, { fases: trilha.fases });
    /* O servidor refaz a conta e é ele quem manda: se o número dele for
       diferente do que a tela mostrou, a tela se corrige. */
    const p = r.partida;
    if (p.pontos !== local.pontos || p.estrelas !== local.estrelas || p.acertos !== local.acertos) {
      pintarResultado({ ...local, ...p });
      montarAcoes(p.estrelas);
    }
    pintarConquistas(r.novasConquistas);
    $("salvoAviso").textContent = r.offline
      ? "Progresso salvo neste dispositivo ✔"
      : p.recorde ? "Novo recorde salvo! ✔" : "Progresso salvo ✔";
  } catch (e) {
    console.error("Falha ao salvar resultado:", e);
    $("salvoAviso").textContent = "Não deu pra salvar agora — o professor pode tentar recarregar.";
  }
}

function finalizarFase() {
  pararTimer();
  setTravado(true);
  terminou = true;
  sincronizarRelogio();

  /* A conta final sai do registro das respostas — o MESMO array que o
     servidor recebe. O que a tela mostra agora e o que fica salvo partem
     do mesmo dado. */
  const conta = calcularPartida(respostas, fase);
  const estrelas = calcularEstrelas(conta.acertos, totalQ, fase.meta);
  const local = {
    respostas,
    tempoGasto: relogio.segundos(),
    pontos: conta.pontos,
    acertos: conta.acertos,
    erros: conta.erros,
    melhorCombo: conta.melhorCombo,
    total: totalQ,
    estrelas,
    nivel: nivelDaRecompensa(estrelas),
  };

  pintarResultado(local);
  pintarConquistas([]);
  montarAcoes(estrelas);

  /* Guarda os problemas que a criança acabou de ver: na próxima vez que ela
     jogar esta fase, eles entram em `p_excluir` e o banco sorteia outros
     (história 5.3 — não-repetição imediata). */
  lembrarServidos(faseId, fonte.servidos());

  $("salvoAviso").textContent = "Salvando progresso...";
  $("fimOverlay").classList.add("aberto");
  // leva o foco pro cartão: sem isto o teclado/leitor de tela continua atrás do overlay
  if (!galeria.aberta()) $("fimTitulo").focus();

  // sem await: os botões da tela de fim já funcionam enquanto o envio acontece
  salvamento = salvar(local);
}

function botao(txt, cls, onClick) {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = txt;
  b.addEventListener("click", onClick);
  return b;
}

$("btnFimProgresso").addEventListener("click", () => sairDaFase("progresso.html"));

/* ---- sair ---- */
$("btnVoltar").addEventListener("click", () => {
  if (terminou) { sairDaFase("jogar.html"); return; }
  if (confirm("Sair da fase? O progresso desta partida será perdido.")) {
    location.href = "jogar.html";
  }
});

/* ---- começa ---- */
sincronizarRelogio();
carregarQuestao();

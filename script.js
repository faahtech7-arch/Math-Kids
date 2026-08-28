/*
  =========================================================================
  Math Kids — Login por Avatar + Área do Responsável (histórias 3.1 / 3.2)
  =========================================================================
  Integração real com Supabase (substitui os dados mockados da versão
  anterior). Nada de PIN em texto puro: a verificação e o hash do PIN
  acontecem dentro do Postgres, via as funções RPC definidas em
  supabase/schema.sql (login_avatar, cadastrar_responsavel).

  O front-end nunca lê a coluna pin_hash nem a tabela avatares/responsaveis
  diretamente — RLS está ligado e sem policies, então só as funções RPC
  (security definer) conseguem acessar os dados.
*/

import { supabase } from "./supabaseClient.js";
import { salvarSessao } from "./sessao.js";
import { faceSVG } from "./avatares.js";

const MAX_PIN_LENGTH = 4;
const TERMO_VERSAO = "v1-2026-08";

let AVATARS = [];         // avatares ativos (vêm de listar_avatares_ativos)
let AVAILABLE_POOL = [];  // avatares livres (vêm de listar_avatares_disponiveis)
let currentAvatar = null;
let currentPin = "";
let failedAttempts = 0;

// ---- Helpers de UI de carregamento/erro simples (sem libs extra) ----
function showLoadError(message){
  grid.innerHTML = `<p class="load-error" style="grid-column:1/-1; text-align:center; font-weight:700; color:var(--ink-soft);">${message}</p>`;
}

// ---- Monta o grid de avatares (reexecutável ao cadastrar uma nova criança) ----
const grid = document.getElementById("avatarGrid");
function renderAvatarGrid(){
  grid.innerHTML = "";
  AVATARS.forEach(av => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "avatar-card";
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", `Entrar como ${av.nome}`);
    card.innerHTML = `
      <div class="avatar-face" style="background:#fff">${faceSVG(av.tipo, av.cor, av.accent)}</div>
      <span class="avatar-name">${av.nome}</span>
      <span class="avatar-status">Pronto pra jogar</span>
    `;
    card.addEventListener("click", () => openPinSheet(av));
    grid.appendChild(card);
  });
}

async function carregarAvataresAtivos(){
  const { data, error } = await supabase.rpc("listar_avatares_ativos");
  if(error){
    console.error("Erro ao carregar avatares:", error);
    showLoadError("Não deu pra carregar os avatares agora. Tenta recarregar a página.");
    return;
  }
  AVATARS = data || [];
  renderAvatarGrid();
}

async function carregarAvataresDisponiveis(){
  const { data, error } = await supabase.rpc("listar_avatares_disponiveis");
  if(error){
    console.error("Erro ao carregar avatares disponíveis:", error);
    AVAILABLE_POOL = [];
    return;
  }
  AVAILABLE_POOL = data || [];
}

// ---- Monta o teclado numérico (sem campo de texto livre) ----
const keypad = document.getElementById("keypad");
const keys = ["1","2","3","4","5","6","7","8","9","del","0","ok"];
keys.forEach(k => {
  const btn = document.createElement("button");
  btn.type = "button";
  if(k === "del"){
    btn.className = "key action";
    btn.setAttribute("aria-label","Apagar número");
    btn.textContent = "⌫";
    btn.addEventListener("click", () => updatePin(currentPin.slice(0,-1)));
  } else if(k === "ok"){
    btn.className = "key ok";
    btn.id = "okKey";
    btn.textContent = "OK";
    btn.disabled = true;
    btn.addEventListener("click", tryLogin);
  } else {
    btn.className = "key";
    btn.textContent = k;
    btn.addEventListener("click", () => updatePin(currentPin + k));
  }
  keypad.appendChild(btn);
});

const overlay = document.getElementById("pinOverlay");
const pinSheet = document.getElementById("pinSheet");
const pinAvatarFace = document.getElementById("pinAvatarFace");
const pinAvatarName = document.getElementById("pinAvatarName");
const pinDots = document.getElementById("pinDots");
const pinFeedback = document.getElementById("pinFeedback");
const okKey = document.getElementById("okKey");

function openPinSheet(avatar){
  currentAvatar = avatar;
  currentPin = "";
  failedAttempts = 0;
  pinAvatarFace.innerHTML = faceSVG(avatar.tipo, avatar.cor, avatar.accent);
  pinAvatarFace.style.background = "#fff";
  pinAvatarName.textContent = avatar.nome;
  pinFeedback.textContent = "";
  pinFeedback.classList.remove("error");
  renderDots();
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden","false");
}

function closePinSheet(){
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden","true");
  currentAvatar = null;
  currentPin = "";
}
document.getElementById("closePinBtn").addEventListener("click", closePinSheet);
overlay.addEventListener("click", (e) => { if(e.target === overlay) closePinSheet(); });

function updatePin(next){
  currentPin = next.slice(0, MAX_PIN_LENGTH);
  renderDots();
  okKey.disabled = currentPin.length !== MAX_PIN_LENGTH;
  pinFeedback.textContent = "";
  pinFeedback.classList.remove("error");
}

function renderDots(){
  const dots = pinDots.querySelectorAll(".dot");
  dots.forEach((d, i) => d.classList.toggle("filled", i < currentPin.length));
}

async function tryLogin(){
  if(!currentAvatar || currentPin.length !== MAX_PIN_LENGTH) return;

  okKey.disabled = true;
  pinFeedback.textContent = "Verificando...";
  pinFeedback.classList.remove("error");

  const { data: token, error } = await supabase.rpc("iniciar_sessao", {
    p_avatar_id: currentAvatar.id,
    p_pin: currentPin
  });

  okKey.disabled = currentPin.length !== MAX_PIN_LENGTH;

  if(error){
    console.error("Erro no login:", error);
    pinFeedback.textContent = "Deu ruim aqui, tenta de novo!";
    pinFeedback.classList.add("error");
    return;
  }

  if(token){
    pinFeedback.textContent = "Isso aí! 🎉";
    pinFeedback.classList.remove("error");
    const loggedInAvatar = currentAvatar; // guarda a referência antes de closePinSheet() zerar currentAvatar
    salvarSessao({
      token,
      avatar: {
        id: loggedInAvatar.id, nome: loggedInAvatar.nome,
        tipo: loggedInAvatar.tipo, cor: loggedInAvatar.cor, accent: loggedInAvatar.accent,
      },
    });
    setTimeout(() => {
      closePinSheet();
      showSuccess(loggedInAvatar);
    }, 350);
  } else {
    failedAttempts++;
    pinFeedback.textContent = "PIN incorreto, tenta de novo!";
    pinFeedback.classList.add("error");
    pinSheet.classList.remove("shake");
    void pinSheet.offsetWidth; // reinicia a animação
    pinSheet.classList.add("shake");
    updatePin("");
  }
}

const successScreen = document.getElementById("successScreen");
const successFace = document.getElementById("successFace");
const successText = document.getElementById("successText");

function showSuccess(avatar){
  successFace.innerHTML = faceSVG(avatar.tipo, avatar.cor, avatar.accent);
  successText.textContent = `Oi, ${avatar.nome}!`;
  successScreen.classList.add("open");

  // Sessão já salva em tryLogin(): vai para o menu de fases (história 4.1).
  setTimeout(() => {
    window.location.href = "jogar.html";
  }, 1400);
}

/*
  =========================================================================
  Área do responsável — Cadastro da criança + consentimento (história 3.2)
  =========================================================================
  Regras que este fluxo respeita, direto da Declaração de Escopo:
    - quem cadastra é sempre o responsável, nunca a criança (bloqueado
      atrás do botão "Área do responsável", fora da tela de avatares)
    - nenhum dado da criança é digitado; o responsável só ESCOLHE um
      avatar pré-definido (nome já vem pronto) e define o PIN dela
    - o checkbox de consentimento nunca vem marcado por padrão
    - a gravação em responsaveis / consentimentos / avatares acontece de
      uma vez só, dentro da função cadastrar_responsavel (schema.sql),
      que também gera o hash do PIN — nunca texto puro
*/
const respOverlay = document.getElementById("respOverlay");
const respSheet = document.getElementById("respSheet");
const respBody = document.getElementById("respStepBody");
const respEyebrow = document.getElementById("respStepEyebrow");
const respTitle = document.getElementById("respStepTitle");
const respProgress = document.getElementById("respProgress");

const TOTAL_STEPS = 4; // dados > consentimento > avatar+PIN > confirmação
let respStep = 0; // 0 = tela de escolha (cadastrar x recuperar PIN)
let respData = { nome: "", contato: "", avatar: null, pin: "" };

document.getElementById("openRespHub").addEventListener("click", openRespHub);
document.getElementById("closeRespBtn").addEventListener("click", closeRespHub);
respOverlay.addEventListener("click", (e) => { if(e.target === respOverlay) closeRespHub(); });

async function openRespHub(){
  respStep = 0;
  respData = { nome: "", contato: "", avatar: null, pin: "" };
  renderRespStep();
  respOverlay.classList.add("open");
  respOverlay.setAttribute("aria-hidden", "false");
  // recarrega a lista de avatares livres, caso alguém tenha cadastrado
  // uma criança em outro PC da escola desde a última vez
  await carregarAvataresDisponiveis();
}

function closeRespHub(){
  respOverlay.classList.remove("open");
  respOverlay.setAttribute("aria-hidden", "true");
}

function renderProgress(){
  respProgress.innerHTML = "";
  if(respStep === 0){ return; } // barra de progresso só aparece dentro do fluxo de cadastro
  for(let i = 1; i <= TOTAL_STEPS; i++){
    const seg = document.createElement("span");
    seg.className = "seg" + (i < respStep ? " done" : "") + (i === respStep ? " current" : "");
    respProgress.appendChild(seg);
  }
}

function renderRespStep(){
  renderProgress();

  if(respStep === 0){
    respEyebrow.textContent = "Área do responsável";
    respTitle.textContent = "O que você precisa?";
    respBody.innerHTML = `
      <button type="button" class="option-card" id="goRegister">
        <span class="emoji">🧒</span>
        <span>
          <strong>Cadastrar minha criança</strong>
          <span class="sub">Criar o avatar e o PIN dela pela primeira vez</span>
        </span>
      </button>
      <button type="button" class="option-card" id="goResetPin">
        <span class="emoji">🔑</span>
        <span>
          <strong>Esqueci o PIN da minha criança</strong>
          <span class="sub">Redefinir o PIN de um avatar já existente</span>
        </span>
      </button>
    `;
    document.getElementById("goRegister").addEventListener("click", () => { respStep = 1; renderRespStep(); });
    document.getElementById("goResetPin").addEventListener("click", () => {
      closeRespHub();
      alert("Fluxo da história 3.6 (recuperação de PIN): autenticação do responsável → escolher o avatar → definir novo PIN. Pode ser plugado aqui do mesmo jeito que o cadastro, com uma função RPC própria (ex.: redefinir_pin).");
    });
    return;
  }

  if(respStep === 1){
    respEyebrow.textContent = "Passo 1 de 3";
    respTitle.textContent = "Seus dados";
    respBody.innerHTML = `
      <div class="field-group">
        <label for="respNome">Seu nome</label>
        <input type="text" id="respNome" autocomplete="name" value="${respData.nome}">
      </div>
      <div class="field-group">
        <label for="respContato">E-mail ou telefone</label>
        <input type="text" id="respContato" autocomplete="email" value="${respData.contato}">
      </div>
      <p style="font-size:0.78rem; color:var(--ink-soft); margin-top:-4px;">
        Só o essencial pra falar com você, se precisar — nenhum dado da criança é pedido aqui.
      </p>
      <div class="step-actions">
        <button type="button" class="btn ghost" id="respBack">Voltar</button>
        <button type="button" class="btn primary" id="respNext" disabled>Continuar</button>
      </div>
    `;
    const nome = document.getElementById("respNome");
    const contato = document.getElementById("respContato");
    const nextBtn = document.getElementById("respNext");
    function validate(){ nextBtn.disabled = !(nome.value.trim().length > 1 && contato.value.trim().length > 3); }
    nome.addEventListener("input", validate);
    contato.addEventListener("input", validate);
    validate();
    document.getElementById("respBack").addEventListener("click", () => { respStep = 0; renderRespStep(); });
    nextBtn.addEventListener("click", () => {
      respData.nome = nome.value.trim();
      respData.contato = contato.value.trim();
      respStep = 2;
      renderRespStep();
    });
    return;
  }

  if(respStep === 2){
    respEyebrow.textContent = "Passo 2 de 3";
    respTitle.textContent = "Termo de consentimento";
    respBody.innerHTML = `
      <div class="consent-box">
        Em conformidade com a LGPD (Art. 14), o Math Kids só coleta o mínimo necessário
        para o uso educacional da criança: um avatar pré-definido e um PIN numérico,
        sem nome real, foto, e-mail ou qualquer outro dado pessoal da criança.
        Os dados de contato acima são usados apenas para comunicação com o responsável
        e redefinição de PIN, quando necessário. Você pode revisar este termo a qualquer
        momento na Área do responsável.
      </div>
      <label class="consent-check">
        <input type="checkbox" id="consentCheck">
        <span>Li e autorizo o uso do Math Kids pela minha criança, conforme descrito acima.</span>
      </label>
      <div class="step-actions">
        <button type="button" class="btn ghost" id="respBack">Voltar</button>
        <button type="button" class="btn primary" id="respNext" disabled>Continuar</button>
      </div>
    `;
    const check = document.getElementById("consentCheck");
    const nextBtn = document.getElementById("respNext");
    check.addEventListener("change", () => { nextBtn.disabled = !check.checked; });
    document.getElementById("respBack").addEventListener("click", () => { respStep = 1; renderRespStep(); });
    nextBtn.addEventListener("click", () => {
      respData.versaoTermo = TERMO_VERSAO;
      respStep = 3;
      renderRespStep();
    });
    return;
  }

  if(respStep === 3){
    respEyebrow.textContent = "Passo 3 de 3";
    respTitle.textContent = "Avatar e PIN da criança";

    if(AVAILABLE_POOL.length === 0){
      respBody.innerHTML = `
        <p style="font-weight:700; color:var(--ink-soft);">
          Todos os avatares disponíveis já foram usados. Fale com o professor
          para liberar novos avatares pré-definidos.
        </p>
        <div class="step-actions">
          <button type="button" class="btn ghost" id="respBack">Voltar</button>
        </div>
      `;
      document.getElementById("respBack").addEventListener("click", () => { respStep = 2; renderRespStep(); });
      return;
    }

    respBody.innerHTML = `
      <p style="font-weight:700; font-size:0.88rem; margin:0 0 8px;">Escolha o avatar da criança</p>
      <div class="avatar-pick-grid" id="avatarPickGrid"></div>
      <div class="mini-keypad-wrap">
        <p style="font-weight:700; font-size:0.88rem; margin:14px 0 8px;">Defina um PIN de 4 dígitos</p>
        <div class="pin-dots" id="respPinDots">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
        <div class="keypad" id="respKeypad"></div>
      </div>
      <p class="pin-feedback error" id="respFeedback" role="status" aria-live="polite"></p>
      <div class="step-actions">
        <button type="button" class="btn ghost" id="respBack">Voltar</button>
        <button type="button" class="btn primary" id="respNext" disabled>Concluir cadastro</button>
      </div>
    `;

    const pickGrid = document.getElementById("avatarPickGrid");
    AVAILABLE_POOL.forEach(av => {
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "avatar-pick";
      pick.innerHTML = `
        <div class="avatar-face" style="background:#fff">${faceSVG(av.tipo, av.cor, av.accent)}</div>
        <span>${av.nome}</span>
      `;
      pick.addEventListener("click", () => {
        respData.avatar = av;
        [...pickGrid.children].forEach(c => c.classList.remove("selected"));
        pick.classList.add("selected");
        checkStep3Ready();
      });
      pickGrid.appendChild(pick);
    });

    const respDots = document.getElementById("respPinDots");
    const respKeys = ["1","2","3","4","5","6","7","8","9","del","0","ok"];
    const respKeypad = document.getElementById("respKeypad");
    respKeys.forEach(k => {
      const btn = document.createElement("button");
      btn.type = "button";
      if(k === "del"){
        btn.className = "key action";
        btn.setAttribute("aria-label","Apagar número");
        btn.textContent = "⌫";
        btn.addEventListener("click", () => { respData.pin = respData.pin.slice(0,-1); renderRespDots(); checkStep3Ready(); });
      } else if(k === "ok"){
        return; // este passo usa o botão "Concluir cadastro" abaixo, não um OK no teclado
      } else {
        btn.className = "key";
        btn.textContent = k;
        btn.addEventListener("click", () => {
          if(respData.pin.length < MAX_PIN_LENGTH){ respData.pin += k; }
          renderRespDots();
          checkStep3Ready();
        });
      }
      respKeypad.appendChild(btn);
    });

    function renderRespDots(){
      respDots.querySelectorAll(".dot").forEach((d,i) => d.classList.toggle("filled", i < respData.pin.length));
    }

    function checkStep3Ready(){
      document.getElementById("respNext").disabled = !(respData.avatar && respData.pin.length === MAX_PIN_LENGTH);
    }

    document.getElementById("respBack").addEventListener("click", () => { respStep = 2; renderRespStep(); });
    document.getElementById("respNext").addEventListener("click", finishRegistration);
    return;
  }

  if(respStep === 4){
    respEyebrow.textContent = "Tudo pronto";
    respTitle.textContent = "Cadastro concluído!";
    respBody.innerHTML = `
      <div style="text-align:center; padding: 6px 0 4px;">
        <div class="avatar-face" style="width:84px; height:84px; margin:0 auto 12px; background:#fff">
          ${faceSVG(respData.avatar.tipo, respData.avatar.cor, respData.avatar.accent)}
        </div>
        <p style="font-weight:800; font-size:1.05rem; margin:0 0 4px;">${respData.avatar.nome} já pode jogar!</p>
        <p style="color:var(--ink-soft); font-weight:600; font-size:0.9rem; margin:0;">
          É só voltar pra tela inicial, tocar no avatar <strong>${respData.avatar.nome}</strong> e digitar o PIN combinado.
        </p>
      </div>
      <div class="step-actions">
        <button type="button" class="btn primary" id="respDone">Voltar para a tela inicial</button>
      </div>
    `;
    document.getElementById("respDone").addEventListener("click", closeRespHub);
    return;
  }
}

async function finishRegistration(){
  const nextBtn = document.getElementById("respNext");
  const feedback = document.getElementById("respFeedback");
  nextBtn.disabled = true;
  feedback.textContent = "Cadastrando...";

  const { data, error } = await supabase.rpc("cadastrar_responsavel", {
    p_nome: respData.nome,
    p_contato: respData.contato,
    p_avatar_id: respData.avatar.id,
    p_pin: respData.pin,
    p_versao_termo: respData.versaoTermo || TERMO_VERSAO
  });

  if(error){
    console.error("Erro ao cadastrar:", error);
    feedback.textContent = "Não deu pra cadastrar agora — tenta de novo em instantes.";
    nextBtn.disabled = false;
    return;
  }

  feedback.textContent = "";

  // atualiza as duas listas com o estado real do banco
  await Promise.all([carregarAvataresAtivos(), carregarAvataresDisponiveis()]);

  respStep = 4;
  renderRespStep();
}

// ---- Inicialização ----
async function init(){
  await Promise.all([carregarAvataresAtivos(), carregarAvataresDisponiveis()]);
}
init();

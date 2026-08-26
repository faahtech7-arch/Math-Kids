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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const MAX_PIN_LENGTH = 4;
const TERMO_VERSAO = "v1-2026-08";

let AVATARS = [];         // avatares ativos (vêm de listar_avatares_ativos)
let AVAILABLE_POOL = [];  // avatares livres (vêm de listar_avatares_disponiveis)
let currentAvatar = null;
let currentPin = "";
let failedAttempts = 0;

// ---- SVGs simples de rostinhos (nenhuma imagem real de criança é usada) ----
function faceSVG(type, color, accent){
  const common = `viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" stroke="#14141A" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;
  const shapes = {
    cat: `<circle cx="50" cy="52" r="34" fill="${color}"/>
          <path d="M22 30 L34 46 L18 46 Z" fill="${color}"/>
          <path d="M78 30 L66 46 L82 46 Z" fill="${color}"/>
          <circle cx="38" cy="52" r="4.5" fill="#1F2A44"/>
          <circle cx="62" cy="52" r="4.5" fill="#1F2A44"/>
          <path d="M42 66 Q50 72 58 66" stroke="#1F2A44" stroke-width="3" fill="none" stroke-linecap="round"/>
          <circle cx="30" cy="60" r="4" fill="${accent}" opacity="0.6"/>
          <circle cx="70" cy="60" r="4" fill="${accent}" opacity="0.6"/>`,
    robot: `<rect x="20" y="24" width="60" height="52" rx="16" fill="${color}"/>
          <rect x="44" y="10" width="12" height="14" rx="4" fill="${accent}"/>
          <circle cx="50" cy="12" r="5" fill="${accent}"/>
          <rect x="34" y="44" width="12" height="12" rx="3" fill="#1F2A44"/>
          <rect x="54" y="44" width="12" height="12" rx="3" fill="#1F2A44"/>
          <rect x="38" y="64" width="24" height="6" rx="3" fill="#1F2A44"/>`,
    fox: `<path d="M50 20 L68 44 L50 58 L32 44 Z" fill="${color}"/>
          <circle cx="50" cy="58" r="26" fill="${color}"/>
          <circle cx="40" cy="56" r="4" fill="#1F2A44"/>
          <circle cx="60" cy="56" r="4" fill="#1F2A44"/>
          <path d="M46 68 L50 72 L54 68 Z" fill="${accent}"/>
          <path d="M42 74 Q50 78 58 74" stroke="#1F2A44" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    owl: `<circle cx="50" cy="54" r="34" fill="${color}"/>
          <circle cx="38" cy="48" r="13" fill="#fff"/>
          <circle cx="62" cy="48" r="13" fill="#fff"/>
          <circle cx="38" cy="48" r="6" fill="#1F2A44"/>
          <circle cx="62" cy="48" r="6" fill="#1F2A44"/>
          <path d="M50 54 L46 62 L54 62 Z" fill="${accent}"/>
          <path d="M28 30 L38 38" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>
          <path d="M72 30 L62 38" stroke="${accent}" stroke-width="4" stroke-linecap="round"/>`,
    bunny: `<ellipse cx="36" cy="20" rx="8" ry="20" fill="${color}"/>
          <ellipse cx="64" cy="20" rx="8" ry="20" fill="${color}"/>
          <circle cx="50" cy="56" r="30" fill="${color}"/>
          <circle cx="40" cy="54" r="4" fill="#1F2A44"/>
          <circle cx="60" cy="54" r="4" fill="#1F2A44"/>
          <path d="M44 66 Q50 70 56 66" stroke="#1F2A44" stroke-width="3" fill="none" stroke-linecap="round"/>
          <circle cx="32" cy="62" r="4" fill="${accent}" opacity="0.6"/>
          <circle cx="68" cy="62" r="4" fill="${accent}" opacity="0.6"/>`,
    bear: `<circle cx="26" cy="28" r="11" fill="${color}"/>
          <circle cx="74" cy="28" r="11" fill="${color}"/>
          <circle cx="50" cy="56" r="32" fill="${color}"/>
          <circle cx="40" cy="56" r="4" fill="#1F2A44"/>
          <circle cx="60" cy="56" r="4" fill="#1F2A44"/>
          <ellipse cx="50" cy="66" rx="9" ry="6" fill="${accent}"/>
          <circle cx="50" cy="62" r="3" fill="#1F2A44"/>`,
    dino: `<path d="M22 78 Q18 50 34 34 Q30 22 40 14 Q44 22 46 26
             Q56 18 66 26 Q70 18 78 20 Q74 28 70 32
             Q80 40 78 54 Q90 56 90 66 L78 64
             Q76 74 66 78 L66 66 Q56 70 46 66 L44 78 L36 78 L38 64
             Q28 62 22 78 Z" fill="${color}"/>
          <path d="M40 16 L44 26 L36 24 Z" fill="${accent}"/>
          <path d="M52 20 L56 30 L48 28 Z" fill="${accent}"/>
          <path d="M64 22 L68 32 L60 30 Z" fill="${accent}"/>
          <circle cx="66" cy="40" r="4" fill="#1F2A44"/>
          <path d="M72 46 Q78 48 80 44" stroke="#1F2A44" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    rocket: `<path d="M50 8 Q68 26 66 56 L34 56 Q32 26 50 8 Z" fill="${color}"/>
          <circle cx="50" cy="38" r="9" fill="#fff"/>
          <circle cx="50" cy="38" r="4.5" fill="${accent}"/>
          <path d="M34 44 Q18 50 16 68 Q28 62 36 56 Z" fill="${accent}"/>
          <path d="M66 44 Q82 50 84 68 Q72 62 64 56 Z" fill="${accent}"/>
          <path d="M40 56 L60 56 L56 74 L44 74 Z" fill="${color}"/>
          <path d="M44 74 L50 92 L56 74 Z" fill="#FFB627"/>
          <path d="M47 74 L50 84 L53 74 Z" fill="#FF6F61"/>`,
    star: `<path d="M50 10 L61 38 L91 40 L67 59 L76 89
             L50 71 L24 89 L33 59 L9 40 L39 38 Z" fill="${color}"/>
          <circle cx="42" cy="52" r="4" fill="#1F2A44"/>
          <circle cx="60" cy="52" r="4" fill="#1F2A44"/>
          <path d="M43 62 Q51 68 59 62" stroke="#1F2A44" stroke-width="3" fill="none" stroke-linecap="round"/>
          <circle cx="50" cy="26" r="3" fill="${accent}" opacity="0.7"/>`,
    alien: `<ellipse cx="50" cy="56" rx="30" ry="34" fill="${color}"/>
          <path d="M38 24 Q34 12 24 8" fill="none"/>
          <circle cx="24" cy="8" r="4" fill="${accent}"/>
          <path d="M62 24 Q66 12 76 8" fill="none"/>
          <circle cx="76" cy="8" r="4" fill="${accent}"/>
          <ellipse cx="38" cy="54" rx="9" ry="13" fill="#14141A"/>
          <ellipse cx="62" cy="54" rx="9" ry="13" fill="#14141A"/>
          <circle cx="35" cy="48" r="2.5" fill="#fff"/>
          <circle cx="59" cy="48" r="2.5" fill="#fff"/>
          <path d="M44 76 Q50 80 56 76" stroke="#14141A" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    unicorn: `<path d="M30 42 Q25 70 40 84 L60 84 Q75 70 70 42 Q75 22 58 17 Q50 8 42 17 Q25 22 30 42 Z" fill="${color}"/>
          <path d="M36 20 L29 6 L44 15 Z" fill="${color}"/>
          <path d="M64 20 L71 6 L56 15 Z" fill="${color}"/>
          <path d="M50 4 L57 24 L43 24 Z" fill="#FFD400"/>
          <path d="M28 32 Q18 44 24 60" stroke="${accent}" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M32 26 Q22 40 27 54" stroke="#FF6F91" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path d="M25 40 Q17 50 22 64" stroke="#4CC9F0" stroke-width="5" fill="none" stroke-linecap="round"/>
          <circle cx="42" cy="52" r="4" fill="#14141A"/>
          <circle cx="60" cy="52" r="4" fill="#14141A"/>
          <path d="M44 70 Q51 75 58 70" stroke="#14141A" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    panda: `<circle cx="26" cy="28" r="14" fill="#14141A"/>
          <circle cx="74" cy="28" r="14" fill="#14141A"/>
          <circle cx="50" cy="56" r="32" fill="${color}"/>
          <ellipse cx="39" cy="54" rx="10" ry="13" fill="#14141A"/>
          <ellipse cx="61" cy="54" rx="10" ry="13" fill="#14141A"/>
          <circle cx="39" cy="56" r="3.5" fill="#fff"/>
          <circle cx="61" cy="56" r="3.5" fill="#fff"/>
          <ellipse cx="50" cy="68" rx="4.5" ry="3.5" fill="#14141A"/>
          <path d="M44 74 Q50 78 56 74" stroke="#14141A" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <circle cx="28" cy="66" r="4" fill="${accent}" opacity="0.7"/>
          <circle cx="72" cy="66" r="4" fill="${accent}" opacity="0.7"/>`,
    shark: `<path d="M18 58 Q28 30 58 30 Q84 32 92 50 Q74 48 62 60 Q52 76 30 74 Q20 70 18 58 Z" fill="${color}"/>
          <path d="M54 30 L61 8 L70 30 Z" fill="${color}"/>
          <path d="M28 72 L20 84 L36 76 Z" fill="${color}"/>
          <circle cx="70" cy="46" r="4" fill="#14141A"/>
          <path d="M74 58 Q84 60 90 55" stroke="#14141A" stroke-width="3" fill="none" stroke-linecap="round"/>
          <path d="M76 58 L79 64 L82 58 Z" fill="#fff"/>
          <path d="M83 57 L86 63 L89 57 Z" fill="#fff"/>`
  };
  return `<svg ${common}>${shapes[type] || shapes.cat}</svg>`;
}

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

  const { data: success, error } = await supabase.rpc("login_avatar", {
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

  if(success){
    pinFeedback.textContent = "Isso aí! 🎉";
    pinFeedback.classList.remove("error");
    const loggedInAvatar = currentAvatar; // guarda a referência antes de closePinSheet() zerar currentAvatar
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

  // TODO: aqui entraria o redirect real para a tela de seleção de fases
  // (história 4.1), já autenticado com o token/sessão do avatar.
  setTimeout(() => {
    successScreen.classList.remove("open");
  }, 2200);
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

/*
  =========================================================================
  Math Kids — Menu de fases (Épico 3, história 5.2)
  =========================================================================
  A lista de fases e o STATUS de cada uma (bloqueada / liberada / concluída)
  vêm do back-end, via js/conteudo.js -> listar_fases_progresso. O front não
  decide mais quem está liberado: ele só desenha o que o servidor respondeu.

  Isso importa porque a regra de progressão agora é validada no Postgres —
  `salvar_resultado_fase` recusa gravar numa fase bloqueada. Se o front e o
  back discordassem, a criança clicaria numa fase e perderia o progresso no
  fim. Desenhando a partir da mesma fonte, os dois nunca divergem.

  Sem Supabase (offline, schema não instalado), `listarFasesComStatus` cai
  sozinho para js/fases.js + o espelho local de progresso e devolve
  origem "local" — a tela continua idêntica para a criança.
  =========================================================================
*/
import { exigirSessao, limparSessao } from "./sessao.js";
import { faceSVG } from "./avatares.js";
import { listarFasesComStatus } from "./conteudo.js";

const sessao = exigirSessao();

document.getElementById("avatarFace").innerHTML =
  faceSVG(sessao.avatar.tipo, sessao.avatar.cor, sessao.avatar.accent);
document.getElementById("avatarNome").textContent = sessao.avatar.nome;

document.getElementById("btnSair").addEventListener("click", async () => {
  await limparSessao();
  location.href = "index.html";
});

const gridFases = document.getElementById("gridFases");
const gridExtras = document.getElementById("gridExtras");

const ROTULO_STATUS = {
  concluida: "Concluída ✔",
  liberada: "Liberada",
  bloqueada: "Bloqueada 🔒",
};

function estrelasHTML(n) {
  let s = "";
  for (let i = 1; i <= 3; i++) s += `<span class="${i <= n ? "on" : "off"}">★</span>`;
  return s;
}

/* Texto do rodapé do cartão: recorde para quem já jogou, convite para quem
   ainda não, e o motivo do cadeado para quem não pode entrar. */
function legendaDoCartao(f, anterior) {
  if (f.status === "bloqueada") {
    return anterior ? `Conclua "${anterior.nome}"` : "Bloqueada";
  }
  return f.melhor_pontos > 0 ? `Recorde: ${f.melhor_pontos} pts` : "Nova!";
}

/*
  Fase bloqueada vira <div>: sem href e sem tabIndex, então não dá pra
  clicar NEM chegar nela pelo teclado. É a redundância pedida pela história
  5.2 — o bloqueio de verdade está no back-end, este aqui é só para a
  criança não bater numa porta fechada.
*/
function cardFase(f, anterior) {
  const bloqueada = f.status === "bloqueada";
  const el = document.createElement(bloqueada ? "div" : "a");
  el.className =
    "fase-card" + (bloqueada ? " bloqueada" : "") + (f.status === "concluida" ? " concluida" : "");

  if (bloqueada) {
    el.setAttribute("aria-disabled", "true");
    el.setAttribute(
      "aria-label",
      anterior
        ? `${f.nome}: bloqueada. Conclua a fase ${anterior.nome} para liberar.`
        : `${f.nome}: bloqueada.`
    );
  } else {
    el.href = `partida.html?fase=${f.id}`;
    el.setAttribute("role", "link");
    el.tabIndex = 0;
  }

  const status = document.createElement("span");
  status.className = `status ${f.status}`;
  status.textContent = ROTULO_STATUS[f.status] || "";

  el.innerHTML = `
    <span class="num">${f.extra ? "EXTRA" : "FASE " + f.id}</span>
    <span class="emoji" style="${bloqueada ? "" : `background:${f.cor}`}">${bloqueada ? "🔒" : f.emoji}</span>
    <span class="titulo">${f.nome}</span>
    <span class="estrelas">${estrelasHTML(f.estrelas)}</span>
    <span class="melhor">${legendaDoCartao(f, anterior)}</span>
  `;
  el.appendChild(status);
  return el;
}

function desenhar(fases) {
  gridFases.innerHTML = "";
  gridExtras.innerHTML = "";

  const ordenadas = fases.slice().sort((a, b) => a.ordem - b.ordem);
  ordenadas.forEach((f, i) => {
    const grade = f.extra ? gridExtras : gridFases;
    grade.appendChild(cardFase(f, ordenadas[i - 1] || null));
  });

  // O total de estrelas acompanha o conteúdo cadastrado: cadastrar uma fase
  // nova no banco muda o placar sozinho, sem tocar no front.
  document.getElementById("maxEstrelas").textContent = ordenadas.length * 3;
  document.getElementById("totalEstrelas").textContent =
    ordenadas.reduce((s, f) => s + (f.estrelas || 0), 0);
}

async function atualizar() {
  const { fases, erro } = await listarFasesComStatus(sessao.token);

  // Sessão expirada é o único erro que a criança precisa sentir: volta pro
  // login. Qualquer outra falha já virou conteúdo local lá dentro.
  if (erro && String(erro).includes("Sessão")) {
    await limparSessao();
    location.replace("index.html");
    return;
  }
  if (erro) console.warn("Fases: usando conteúdo local.", erro);

  desenhar(fases);
}

await atualizar();

/* Voltar da partida costuma vir do cache de navegação (bfcache), que
   restaura a página exatamente como ela estava — com a fase recém-concluída
   ainda cinza. Refazer a busca aqui é o que faz o desbloqueio aparecer na
   hora, sem a criança precisar recarregar. */
window.addEventListener("pageshow", (e) => {
  if (e.persisted) atualizar();
});

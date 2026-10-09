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

  Épico 4: cada cartão concluído mostra a MEDALHA da fase (história 6.2) e
  o menu ganhou dois atalhos — o painel "Meu progresso" (outra página) e a
  Galeria de Conquistas (janela por cima do menu, js/galeria.js).
  =========================================================================
*/
import { exigirSessao, limparSessao } from "./sessao.js";
import { faceSVG } from "./avatares.js";
import { listarFasesComStatus } from "./conteudo.js";
import { carregarConquistas, conquistasNaoVistas } from "./progresso.js";
import { NIVEIS, medalhaSVG, nivelDaRecompensa } from "./recompensas.js";
import { criarGaleria, textoDaContagem } from "./galeria.js";

const sessao = exigirSessao();

document.getElementById("avatarFace").innerHTML =
  faceSVG(sessao.avatar.tipo, sessao.avatar.cor, sessao.avatar.accent);
document.getElementById("avatarNome").textContent = sessao.avatar.nome;

async function voltarAoLogin() {
  await limparSessao();
  location.replace("index.html");
}

document.getElementById("btnSair").addEventListener("click", async () => {
  await limparSessao();
  location.href = "index.html";
});

/* ---- Galeria de Conquistas (história 6.6) ----
   O atalho mostra quantas a criança já tem e acende o "NOVA!" quando existe
   conquista que ela ainda não abriu a galeria para ver. */
function pintarAtalhoDeConquistas(conquistas) {
  const resumo = textoDaContagem(conquistas);
  if (resumo) document.getElementById("conquistasResumo").textContent = resumo;
  document.getElementById("conquistasSelo").hidden = conquistasNaoVistas(conquistas).length === 0;
}

const galeria = criarGaleria({
  token: sessao.token,
  aoSessaoExpirada: voltarAoLogin,
  aoCarregar: pintarAtalhoDeConquistas, // abrir a galeria apaga o "NOVA!"
});
document.getElementById("btnConquistas").addEventListener("click", () => galeria.abrir());

async function atualizarAtalhoDeConquistas() {
  const { conquistas } = await carregarConquistas(sessao.token);
  if (conquistas.length) pintarAtalhoDeConquistas(conquistas);
}

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

  /* Medalha da fase (história 6.2): um selo no canto do emoji. Ela sai das
     estrelas — bronze, prata e ouro são 1, 2 e 3 estrelas — então as duas
     nunca se contradizem no cartão. O nome vai escondido em texto porque o
     desenho sozinho não diz nada a um leitor de tela. */
  const nivel = bloqueada ? null : nivelDaRecompensa(f.estrelas);
  if (nivel) {
    const selo = document.createElement("span");
    selo.className = "medalha medalha-selo";
    selo.innerHTML = medalhaSVG(nivel);
    el.querySelector(".emoji").appendChild(selo);

    const nome = document.createElement("span");
    nome.className = "visually-hidden";
    nome.textContent = `${NIVEIS[nivel].nome}.`;
    el.querySelector(".estrelas").after(nome);
  }
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
    await voltarAoLogin();
    return;
  }
  if (erro) console.warn("Fases: usando conteúdo local.", erro);

  desenhar(fases);
  // sem await: o menu não espera a galeria para aparecer
  atualizarAtalhoDeConquistas();
}

await atualizar();

/* Voltar da partida costuma vir do cache de navegação (bfcache), que
   restaura a página exatamente como ela estava — com a fase recém-concluída
   ainda cinza. Refazer a busca aqui é o que faz o desbloqueio aparecer na
   hora, sem a criança precisar recarregar. */
window.addEventListener("pageshow", (e) => {
  if (e.persisted) atualizar();
});

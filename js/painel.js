/*
  =========================================================================
  Math Kids — Painel "Meu progresso" (Épico 4, histórias 6.5 e 6.7)
  =========================================================================
  A tela onde a criança VÊ o que já fez. Fica separada do menu de fases
  (progresso.html) e não tem tabela nem gráfico técnico: só coisa que uma
  criança de 7 anos lê de relance.

    Minhas fases        barra + a trilha, uma bolinha por fase, com a
                        medalha e as estrelas de cada uma;
    Meus pontos         o total em moedas, o próximo objetivo e as estrelas;
    Minhas recompensas  o medalheiro (ouro / prata / bronze) e a Galeria de
                        Conquistas embutida.

  Uma ida só ao banco: carregarPainel() chama painel_progresso, que traz
  fases, pontuação e recompensas juntas. Sem banco, o mesmo painel chega
  montado com o que está neste dispositivo (js/progresso.js cuida disso) e
  o rodapé avisa.

  Aqui só mora o DESENHO. Os números já chegam conferidos por
  normalizarPainel (js/recompensas.js), e todo texto que vem do banco entra
  por textContent, nunca por innerHTML.
  =========================================================================
*/
import { exigirSessao, limparSessao } from "./sessao.js";
import { faceSVG } from "./avatares.js";
import { carregarPainel, conquistasNaoVistas, marcarConquistasVistas } from "./progresso.js";
import {
  NIVEIS,
  medalhaSVG,
  formatarPontos,
  proximoObjetivo,
  textoDoProgresso,
} from "./recompensas.js";
import { montarGaleria } from "./galeria.js";

const sessao = exigirSessao();

const $ = (id) => document.getElementById(id);

$("avatarFace").innerHTML =
  faceSVG(sessao.avatar.tipo, sessao.avatar.cor, sessao.avatar.accent);
$("avatarNome").textContent = sessao.avatar.nome;

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined && texto !== null) el.textContent = texto;
  return el;
}

function decorativo(el) {
  el.setAttribute("aria-hidden", "true");
  return el;
}

/* ===================================================================== */
/* Barras                                                                 */
/* ===================================================================== */

/* Guarda o quanto cada barra deve encher; a largura só é aplicada depois
   que o painel aparece (ver desenhar) — é isso que faz a barra CRESCER na
   entrada em vez de já nascer cheia. O valor em texto vai no aria para o
   leitor de tela não depender do desenho. */
const barrasPendentes = [];

function prepararBarra(barra, atual, maximo, texto) {
  const teto = Math.max(0, maximo);
  const valor = Math.min(Math.max(0, atual), teto);
  barra.setAttribute("aria-valuemin", "0");
  barra.setAttribute("aria-valuemax", String(teto));
  barra.setAttribute("aria-valuenow", String(valor));
  barra.setAttribute("aria-valuetext", texto);
  barrasPendentes.push([barra.querySelector("i"), teto > 0 ? valor / teto : 0]);
}

function encherBarras() {
  for (const [cheio, fracao] of barrasPendentes.splice(0)) {
    cheio.style.width = `${Math.round(fracao * 100)}%`;
  }
}

/* ===================================================================== */
/* Minhas fases                                                           */
/* ===================================================================== */

function descricaoDaFase(f, atual) {
  if (f.status === "bloqueada") return `${f.nome}: bloqueada.`;
  if (!f.concluida) return `${f.nome}: liberada${atual ? ", você está aqui" : ""}.`;
  const medalha = f.nivel_recompensa ? `, ${NIVEIS[f.nivel_recompensa].nome.toLowerCase()}` : "";
  return `${f.nome}: concluída, ${f.estrelas} de 3 estrelas${medalha}.`;
}

/* Uma bolinha por fase. O desenho é só para os olhos; quem usa leitor de
   tela ouve a frase de descricaoDaFase. */
function itemDaTrilha(f, atual) {
  const bloqueada = f.status === "bloqueada";
  const li = criar("li", `trilha-fase ${f.status}${atual ? " atual" : ""}`);

  const bola = decorativo(criar("span", "trilha-bola", bloqueada ? "🔒" : f.icone));
  if (!bloqueada) bola.style.background = f.cor;
  if (f.nivel_recompensa) {
    const selo = criar("span", "medalha");
    selo.innerHTML = medalhaSVG(f.nivel_recompensa);
    bola.appendChild(selo);
  }

  const estrelas = decorativo(criar("span", "trilha-estrelas"));
  if (!bloqueada) {
    for (let i = 1; i <= 3; i++) estrelas.appendChild(criar("span", i <= f.estrelas ? "on" : "off", "★"));
  }

  li.append(
    criar("span", "visually-hidden", descricaoDaFase(f, atual)),
    bola,
    decorativo(criar("span", "trilha-rotulo", f.extra ? "Extra" : `Fase ${f.fase_id}`)),
    estrelas
  );
  return li;
}

function pintarFases(resumo, fases) {
  $("fasesFeitas").textContent = resumo.fases_concluidas;
  $("fasesTotal").textContent = resumo.fases_total;
  prepararBarra($("barraFases"), resumo.fases_concluidas, resumo.fases_total,
    `${resumo.fases_concluidas} de ${resumo.fases_total} fases concluídas`);

  const atualId = resumo.fase_atual ? resumo.fase_atual.fase_id : null;
  $("trilha").replaceChildren(...fases.map((f) => itemDaTrilha(f, f.fase_id === atualId)));

  /* O botão leva direto para a fase atual — a primeira liberada e ainda
     não concluída. Com tudo concluído, volta para o mapa. */
  const continuar = $("btnContinuar");
  if (resumo.fase_atual) {
    continuar.href = `partida.html?fase=${resumo.fase_atual.fase_id}`;
    // espaço que não quebra antes da seta: em tela estreita ela desce junto com a última palavra
    continuar.textContent = `Continuar: ${resumo.fase_atual.icone} ${resumo.fase_atual.nome} ➡`;
  } else {
    continuar.href = "jogar.html";
    continuar.textContent = resumo.fases_total && resumo.fases_concluidas >= resumo.fases_total
      ? "Você concluiu tudo! Jogar de novo 🗺"
      : "Ir para o mapa de fases ➡";
  }
}

/* ===================================================================== */
/* Meus pontos                                                            */
/* ===================================================================== */

/* Ponto vira moeda: número grande sozinho não diz nada para quem ainda
   está aprendendo a contar até mil. O cofre mostra até MOEDAS_NA_TELA; o
   que passar disso vira um "+N", para não empurrar o resto da tela. */
const VALOR_DA_MOEDA = 500;
const MOEDAS_NA_TELA = 10;

function pintarPontos(resumo, conquistas) {
  const pontos = resumo.pontuacao_total;
  $("pontosTotal").textContent = formatarPontos(pontos);

  const inteiras = Math.floor(pontos / VALOR_DA_MOEDA);
  const naTela = Math.min(inteiras, MOEDAS_NA_TELA);
  const moedas = [];
  for (let i = 0; i < naTela; i++) {
    const moeda = criar("span", "moeda", "★");
    moeda.style.animationDelay = `${i * 70}ms`; // caem uma depois da outra
    moedas.push(moeda);
  }
  if (inteiras > naTela) moedas.push(criar("span", "moeda mais", `+${inteiras - naTela}`));
  moedas.push(criar("span", "moeda vazia", "★")); // a próxima, ainda por ganhar

  const cofre = $("moedas");
  cofre.replaceChildren(...moedas.map(decorativo));
  cofre.setAttribute("aria-label",
    inteiras === 0 ? "Nenhuma moeda ainda" : inteiras === 1 ? "1 moeda" : `${inteiras} moedas`);

  const faltam = VALOR_DA_MOEDA - (pontos % VALOR_DA_MOEDA);
  $("moedasLegenda").textContent =
    `Cada moeda vale ${VALOR_DA_MOEDA} pontos. Faltam ${formatarPontos(faltam)} para a próxima!`;

  /* O "próximo objetivo" é a próxima conquista de pontos ainda bloqueada.
     Quem define a meta é o catálogo (dado no banco), não uma escada fixa
     aqui: cadastrar uma conquista nova de pontos já muda este bloco. */
  const alvo = proximoObjetivo(conquistas, "pontos_total");
  const caixa = $("objetivoPontos");
  caixa.hidden = !alvo;
  if (alvo) {
    $("objetivoNome").textContent = `${alvo.icone} ${alvo.nome}`;
    $("objetivoQuanto").textContent = `${textoDoProgresso(alvo)} pontos`;
    prepararBarra($("barraObjetivo"), alvo.valor_atual, alvo.criterio_valor,
      `${textoDoProgresso(alvo)} pontos`);
  }

  const quantas = `${resumo.estrelas} de ${resumo.estrelas_max}`;
  $("estrelasQuanto").textContent = quantas;
  prepararBarra($("barraEstrelas"), resumo.estrelas, resumo.estrelas_max, `${quantas} estrelas`);
}

/* ===================================================================== */
/* Minhas recompensas                                                     */
/* ===================================================================== */

function pintarRecompensas(resumo, conquistas) {
  // medalheiro: quantas fases a criança tem em cada medalha (história 6.2)
  const itens = ["ouro", "prata", "bronze"].map((nivel) => {
    const quantas = resumo.medalhas[nivel] || 0;
    const item = criar("div", "medalheiro-item" + (quantas ? "" : " nenhuma"));
    item.setAttribute("role", "img");
    item.setAttribute("aria-label",
      `${quantas} ${quantas === 1 ? "medalha" : "medalhas"} de ${NIVEIS[nivel].curto.toLowerCase()}`);
    const desenho = criar("span", "medalha");
    desenho.innerHTML = medalhaSVG(nivel);
    item.append(desenho, criar("b", "", quantas), criar("small", "", NIVEIS[nivel].curto));
    return item;
  });
  $("medalheiro").replaceChildren(...itens);

  const m = resumo.medalhas;
  const recado = $("recadoMedalhas");
  if (m.ouro + m.prata + m.bronze === 0) {
    recado.textContent = "Conclua uma fase para ganhar a sua primeira medalha!";
    recado.hidden = false;
  } else if (m.prata + m.bronze > 0) {
    // a regra de "jogar de novo" (história 6.3), dita do jeito da criança
    recado.textContent =
      "Dica: jogando uma fase de novo dá para trocar a medalha por uma melhor. A que você já ganhou nunca se perde!";
    recado.hidden = false;
  } else {
    recado.hidden = true;
  }

  const feitas = conquistas.filter((c) => c.desbloqueada).length;
  $("conquistasQuanto").textContent = conquistas.length ? `${feitas} de ${conquistas.length}` : "";

  const semConquistas = $("recadoConquistas");
  semConquistas.hidden = conquistas.length > 0;
  if (!conquistas.length) {
    $("galeria").replaceChildren();
    semConquistas.textContent = "As conquistas ainda não chegaram. Tenta de novo daqui a pouco!";
    return;
  }

  /* A mesma grade da janela de conquistas (js/galeria.js). O que foi ganho
     e ainda não tinha sido visto entra com o selo "NOVA!" e a animação —
     e, visto aqui, não repete na próxima abertura. */
  const novas = conquistasNaoVistas(conquistas);
  montarGaleria($("galeria"), conquistas, { novas });
  marcarConquistasVistas(novas);
}

/* ===================================================================== */
/* Montagem                                                               */
/* ===================================================================== */

function desenhar(painel) {
  const { resumo, fases, conquistas } = painel;

  $("totalEstrelas").textContent = resumo.estrelas;
  $("maxEstrelas").textContent = resumo.estrelas_max;

  pintarFases(resumo, fases);
  pintarPontos(resumo, conquistas);
  pintarRecompensas(resumo, conquistas);
  $("painelRodape").hidden = painel.origem !== "local";

  const main = $("painel");
  main.hidden = false;
  $("carregando").classList.add("some");
  void main.offsetWidth; // desenha as barras em zero antes de mandar encher
  encherBarras();
}

async function atualizar() {
  const painel = await carregarPainel(sessao.token);

  // Sessão expirada é o único erro que a criança precisa sentir: volta pro
  // login. Qualquer outra falha já virou painel local lá dentro.
  if (painel.erro && String(painel.erro).includes("Sessão")) {
    await limparSessao();
    location.replace("index.html");
    return;
  }
  if (painel.erro) console.warn("Painel: mostrando o que está neste dispositivo.", painel.erro);

  desenhar(painel);
}

await atualizar();

/* Voltar de uma partida costuma vir do cache de navegação (bfcache), que
   restaura a página como ela estava — sem a fase recém-concluída. Refazer
   a busca aqui é o que deixa o painel sempre em dia. */
window.addEventListener("pageshow", (e) => {
  if (e.persisted) atualizar();
});

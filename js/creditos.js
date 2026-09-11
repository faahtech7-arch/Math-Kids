/*
  =========================================================================
  Math Kids — Créditos do time (Épico 5)
  =========================================================================
  Fonte única da autoria do projeto. Quem entrar/sair do grupo se ajusta
  SÓ aqui — a tela de créditos e o README leem desta lista.

  Trabalho acadêmico da Universidade Cruzeiro do Sul.

  API:
    TIME          -> lista crua (nome + papel), útil pra gerar documentação
    abrirCreditos() / fecharCreditos()
  =========================================================================
*/

export const INSTITUICAO = "Universidade Cruzeiro do Sul";

/* Caminhos tentados para a logo da universidade, em ordem de preferência
   (SVG primeiro: não perde qualidade no projetor da apresentação).
   Basta salvar o arquivo oficial em img/ com um destes nomes — se nenhum
   existir, a tela cai no texto e continua funcionando. */
const LOGO_CANDIDATOS = [
  "img/cruzeiro-do-sul.svg",
  "img/cruzeiro-do-sul.png",
  "img/cruzeiro-do-sul.jpg",
];

/* Agrupado por função — a ordem aqui é a ordem que aparece na tela. */
export const TIME = [
  {
    papel: "Product Owner",
    emoji: "🎯",
    cor: "#FFD400",
    pessoas: ["Davi Lima"],
  },
  {
    papel: "Scrum Master",
    emoji: "🌀",
    cor: "#2F6FED",
    pessoas: ["Gabriel Maganha"],
  },
  {
    papel: "QA",
    emoji: "🔍",
    cor: "#B892FF",
    pessoas: ["Arthur Mendonça"],
  },
  {
    papel: "Front-end",
    emoji: "🎨",
    cor: "#FF6F91",
    pessoas: ["Victor Lima", "Arthur Brandão"],
  },
  {
    papel: "Back-end",
    emoji: "⚙️",
    cor: "#2BC48A",
    pessoas: ["Bruno Empstein", "Pedro Matos", "Luan Silva", "Vini Cremonezi"],
  },
];

/* Total de integrantes — usado no subtítulo da tela. */
export const TOTAL_PESSOAS = TIME.reduce((s, g) => s + g.pessoas.length, 0);

const overlay = () => document.getElementById("creditosOverlay");

function montarConteudo() {
  const corpo = document.getElementById("creditosCorpo");
  if (!corpo || corpo.dataset.pronto === "1") return;

  corpo.innerHTML = TIME.map((g) => `
    <section class="cred-grupo">
      <h3 class="cred-papel">
        <span class="cred-emoji" style="background:${g.cor}">${g.emoji}</span>
        ${g.papel}
      </h3>
      <ul class="cred-lista">
        ${g.pessoas.map((p) => `<li>${p}</li>`).join("")}
      </ul>
    </section>
  `).join("");

  corpo.dataset.pronto = "1";
}

/*
  Procura a logo da universidade testando os candidatos em ordem. Só troca
  o texto pela imagem DEPOIS que ela carrega de verdade — assim nunca
  aparece ícone de imagem quebrada se o arquivo ainda não foi salvo.
*/
function carregarLogo() {
  const img = document.getElementById("credLogo");
  const textao = document.getElementById("credInstFallback");
  const legenda = document.getElementById("credInstLegenda");
  if (!img || img.dataset.tentado === "1") return;
  img.dataset.tentado = "1";

  let i = 0;
  const tentar = () => {
    if (i >= LOGO_CANDIDATOS.length) return; // nenhuma logo: segue só com o texto
    const teste = new Image();
    teste.onload = () => {
      img.src = teste.src;
      img.hidden = false;
      if (textao) textao.hidden = true;   // evita repetir o nome ao lado da logo
      if (legenda) legenda.hidden = false;
    };
    teste.onerror = () => { i++; tentar(); };
    teste.src = LOGO_CANDIDATOS[i];
  };
  tentar();
}

export function abrirCreditos() {
  const el = overlay();
  if (!el) return;
  montarConteudo();
  carregarLogo();
  el.classList.add("open");
  el.setAttribute("aria-hidden", "false");
  document.getElementById("creditosTitulo")?.focus();
}

export function fecharCreditos() {
  const el = overlay();
  if (!el) return;
  el.classList.remove("open");
  el.setAttribute("aria-hidden", "true");
}

/* Liga os controles da tela. Chamar uma vez, depois do DOM pronto. */
export function ligarCreditos() {
  const el = overlay();
  if (!el) return;
  document.getElementById("openCreditos")?.addEventListener("click", abrirCreditos);
  document.getElementById("closeCreditosBtn")?.addEventListener("click", fecharCreditos);
  el.addEventListener("click", (e) => { if (e.target === el) fecharCreditos(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && el.classList.contains("open")) fecharCreditos();
  });
}

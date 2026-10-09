/*
  =========================================================================
  Math Kids — Galeria de Conquistas (Épico 4, história 6.6)
  =========================================================================
  Um componente só, usado em três lugares:

    menu de fases   botão "Conquistas" abre a galeria como janela;
    partida         o 🏆 do topo abre a MESMA janela no meio do jogo;
    Meu progresso   a grade aparece embutida no bloco "Minhas recompensas".

  API:
    montarGaleria(destino, conquistas, { novas })
        desenha a grade dentro de `destino`. `novas` = códigos que ganham o
        selo "NOVA!" e a animação de desbloqueio.
    criarGaleria({ token, aoAbrir, aoFechar, aoSessaoExpirada, rotuloVoltar })
        -> { abrir(), fechar(), aberta() }
        cria a janela (uma vez) e busca as conquistas a cada abertura.

  "Acessível a qualquer momento sem interromper o jogo": a janela não troca
  de página. Quem está numa partida passa `aoAbrir`/`aoFechar` para pausar e
  retomar o cronômetro — e por isso ela cobre a tela inteira com fundo
  cheio (ver css/recompensas.css): com o relógio parado, a conta não pode
  ficar à vista.

  Todo texto entra por textContent, nunca por innerHTML: nome e descrição
  vêm do banco e não devem ser interpretados como HTML.
  =========================================================================
*/
import { carregarConquistas, conquistasNaoVistas, marcarConquistasVistas } from "./progresso.js";
import { fracaoDaConquista, textoDoProgresso } from "./recompensas.js";

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto !== undefined && texto !== null) el.textContent = texto;
  return el;
}

function dataCurta(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

/* Ícone redondo com o emoji — reaproveitado pela tela de fim de fase. */
export function iconeDaConquista(c, bloqueada) {
  const icone = criar("span", "conquista-icone");
  icone.setAttribute("aria-hidden", "true");
  icone.style.background = c.cor;
  icone.appendChild(criar("span", "conquista-emoji", c.icone));
  if (bloqueada) icone.appendChild(criar("span", "conquista-cadeado", "🔒"));
  return icone;
}

function cartaoDaConquista(c, ehNova) {
  const el = criar("li", "conquista " + (c.desbloqueada ? "conquistada" : "bloqueada") + (ehNova ? " nova" : ""));

  /* O estado vem em TEXTO antes do nome (só para leitor de tela): quem não
     enxerga a cor nem o cadeado precisa ouvir se já ganhou ou não. */
  el.appendChild(criar("span", "visually-hidden",
    c.desbloqueada ? (ehNova ? "Nova conquista: " : "Conquistada: ") : "Ainda não conquistada: "));
  el.appendChild(iconeDaConquista(c, !c.desbloqueada));
  if (ehNova) el.appendChild(criar("span", "selo-nova", "NOVA!"));
  el.appendChild(criar("h3", "conquista-nome", c.nome));
  if (c.descricao) el.appendChild(criar("p", "conquista-descricao", c.descricao));

  if (c.desbloqueada) {
    const quando = dataCurta(c.data_desbloqueio);
    el.appendChild(criar("p", "conquista-estado", quando ? `✔ Conquistada em ${quando}` : "✔ Conquistada"));
  } else {
    const quanto = textoDoProgresso(c);
    if (quanto) {
      const barra = criar("div", "mini-barra");
      barra.setAttribute("aria-hidden", "true"); // o mesmo número está escrito logo abaixo
      const cheio = criar("i");
      cheio.style.width = `${Math.round(fracaoDaConquista(c) * 100)}%`;
      barra.appendChild(cheio);
      el.appendChild(barra);
    }
    el.appendChild(criar("p", "conquista-estado", quanto || "Ainda não"));
  }
  return el;
}

/*
  Desenha a grade. As conquistadas vêm primeiro (é o que a criança quer
  ver), cada grupo na ordem do catálogo.
*/
export function montarGaleria(destino, conquistas, opcoes) {
  const novas = new Set(opcoes?.novas || []);
  const lista = (Array.isArray(conquistas) ? conquistas : []).slice()
    .sort((a, b) => (b.desbloqueada - a.desbloqueada) || (a.ordem - b.ordem));

  const grade = criar("ul", "galeria-grade");
  for (const c of lista) grade.appendChild(cartaoDaConquista(c, novas.has(c.codigo)));
  destino.replaceChildren(grade);
  return lista.length;
}

export function textoDaContagem(conquistas) {
  const total = conquistas.length;
  const feitas = conquistas.filter((c) => c.desbloqueada).length;
  if (!total) return "";
  if (!feitas) return `${total} conquistas esperando por você`;
  if (feitas === total) return `Todas as ${total} conquistas são suas! 🎉`;
  return `${feitas} de ${total} conquistas`;
}

/* ===================================================================== */
/* A galeria como janela                                                  */
/* ===================================================================== */

export function criarGaleria(config) {
  const cfg = config || {};
  let tela = null;
  let corpo = null;
  let aviso = null;
  let contagem = null;
  let titulo = null;
  let quemAbriu = null;

  function montarJanela() {
    tela = criar("div", "galeria-tela");
    tela.hidden = true;

    const janela = criar("div", "galeria-janela");
    janela.setAttribute("role", "dialog");
    janela.setAttribute("aria-modal", "true");
    janela.setAttribute("aria-labelledby", "galeriaTitulo");

    const topo = criar("div", "galeria-topo");
    const trofeu = criar("span", "galeria-trofeu", "🏆");
    trofeu.setAttribute("aria-hidden", "true");
    const quem = criar("div", "quem");
    contagem = criar("p", "", "Minhas recompensas");
    titulo = criar("h2", "", "Galeria de Conquistas");
    titulo.id = "galeriaTitulo";
    titulo.tabIndex = -1;
    quem.append(contagem, titulo);
    const fecharBtn = criar("button", "close-btn", "✕");
    fecharBtn.type = "button";
    fecharBtn.setAttribute("aria-label", "Fechar a galeria");
    fecharBtn.addEventListener("click", fechar);
    topo.append(trofeu, quem, fecharBtn);

    aviso = criar("p", "galeria-aviso");
    aviso.setAttribute("role", "status");
    aviso.setAttribute("aria-live", "polite");
    corpo = criar("div", "galeria-corpo");

    const voltar = criar("button", "galeria-voltar", cfg.rotuloVoltar || "Fechar");
    voltar.type = "button";
    voltar.addEventListener("click", fechar);

    janela.append(topo, aviso, corpo, voltar);
    tela.appendChild(janela);
    document.body.appendChild(tela);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && aberta()) { e.stopPropagation(); fechar(); }
    }, true);
  }

  function aberta() {
    return !!tela && !tela.hidden;
  }

  async function abrir() {
    if (aberta()) return;
    if (!tela) montarJanela();
    quemAbriu = document.activeElement;
    corpo.replaceChildren();
    contagem.textContent = "Minhas recompensas";
    aviso.textContent = "Abrindo a galeria...";
    aviso.hidden = false;
    tela.hidden = false;
    tela.scrollTop = 0;
    titulo.focus();
    cfg.aoAbrir?.();

    const { conquistas, erro } = await carregarConquistas(cfg.token);
    if (!aberta()) return; // fechou enquanto carregava
    /* Sessão vencida: quem passou `aoSessaoExpirada` (o menu, o painel) manda
       a criança para o login. Quem não passou (a partida, no meio de uma
       fase) segue com o que está guardado neste dispositivo. */
    if (erro && String(erro).includes("Sessão") && cfg.aoSessaoExpirada) {
      cfg.aoSessaoExpirada();
      return;
    }
    if (!conquistas.length) {
      aviso.textContent = "As conquistas ainda não chegaram. Tenta de novo daqui a pouco!";
      return;
    }
    const novas = conquistasNaoVistas(conquistas);
    aviso.hidden = true;
    contagem.textContent = textoDaContagem(conquistas);
    montarGaleria(corpo, conquistas, { novas });
    // viu, está visto: o selo "NOVA!" não volta na próxima abertura
    marcarConquistasVistas(novas);
    cfg.aoCarregar?.(conquistas);
  }

  function fechar() {
    if (!aberta()) return;
    tela.hidden = true;
    cfg.aoFechar?.();
    if (quemAbriu && typeof quemAbriu.focus === "function") quemAbriu.focus();
    quemAbriu = null;
  }

  return { abrir, fechar, aberta };
}

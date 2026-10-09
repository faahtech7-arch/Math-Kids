/*
  =========================================================================
  Math Kids — Recompensas: medalhas e conquistas (Épico 4)
  =========================================================================
  Tudo o que a criança GANHA, sem tocar em tela nem em rede:

    6.2  medalha da fase (bronze / prata / ouro) e o desenho dela;
    6.4  conquistas: o catálogo de reserva, as métricas e o motor de regras;
    6.7  a montagem do painel "Meu progresso" quando o banco não responde.

  O banco é a fonte de verdade (supabase/schema.sql, seção do Épico 4).
  Este módulo é o espelho dele — a regra de ouro do projeto continua
  valendo: se o Supabase cair, ou se o schema novo ainda não foi instalado,
  a criança vê as mesmas medalhas e a mesma galeria, calculadas aqui.

  Três espelhos para manter em sincronia com o schema.sql:
    nivelDaRecompensa()  <->  nivel_da_recompensa()
    calcularMetricas()   <->  metricas_do_avatar()
    CONQUISTAS_PADRAO    <->  seed da tabela `conquistas`
  (ferramentas/testar-recompensas.mjs confere o terceiro sozinho.)

  Como o motor funciona: ele não conhece nenhuma conquista pelo nome. Cada
  conquista diz `criterio_tipo` (o nome de uma métrica) e `criterio_valor`
  (quanto ela precisa valer), e o motor só compara
      metricas[criterio_tipo] >= criterio_valor
  Por isso conquista nova é um insert no banco, e não um deploy.

  Sem DOM e sem rede: dá para importar no Node (teste) e no navegador.
  =========================================================================
*/

/* ===================================================================== */
/* 6.2 — Medalhas                                                        */
/* ===================================================================== */

/* A medalha é a estrela "com outra roupa": sai do MESMO critério, então
   nunca existe 3 estrelas com medalha de prata. */
export const NIVEIS = Object.freeze({
  bronze: Object.freeze({
    nivel: "bronze", estrelas: 1, nome: "Medalha de bronze", curto: "Bronze",
    cor: "#EBA468", sombra: "#B8672B", fita: "#FF6F91",
  }),
  prata: Object.freeze({
    nivel: "prata", estrelas: 2, nome: "Medalha de prata", curto: "Prata",
    cor: "#E3E8F0", sombra: "#97A2B5", fita: "#4CC9F0",
  }),
  ouro: Object.freeze({
    nivel: "ouro", estrelas: 3, nome: "Medalha de ouro", curto: "Ouro",
    cor: "#FFD400", sombra: "#E0A800", fita: "#2BC48A",
  }),
});

export const ORDEM_DOS_NIVEIS = Object.freeze(["bronze", "prata", "ouro"]);

export function nivelDaRecompensa(estrelas) {
  const e = Number(estrelas);
  if (e >= 3) return "ouro";
  if (e === 2) return "prata";
  if (e === 1) return "bronze";
  return null; // 0 estrelas: fase ainda não concluída, sem medalha
}

/* Aceita o que veio do banco, mas só se for um nível que a tela sabe
   desenhar; qualquer outra coisa cai no cálculo pelas estrelas. */
export function nivelValido(valor, estrelas) {
  return ORDEM_DOS_NIVEIS.includes(valor) ? valor : nivelDaRecompensa(estrelas);
}

function pontosDaEstrela(cx, cy, raioFora, raioDentro) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? raioFora : raioDentro;
    pts.push(`${(cx + r * Math.cos(ang)).toFixed(1)},${(cy + r * Math.sin(ang)).toFixed(1)}`);
  }
  return pts.join(" ");
}

/*
  Desenho da medalha, no mesmo traço dos avatares (js/avatares.js): SVG
  gerado, contorno grosso, sem imagem externa. Nível desconhecido devolve
  a "medalha por conquistar" — o mesmo formato em cinza, com um ponto de
  interrogação — para a tela nunca ficar com um buraco.

    medalhaSVG("ouro")                 -> decorativa (aria-hidden)
    medalhaSVG("ouro", { rotulo: 1 })  -> anunciada pelo leitor de tela
*/
export function medalhaSVG(nivel, opcoes) {
  const n = NIVEIS[nivel] || null;
  const cor = n ? n.cor : "#E6E6EC";
  const sombra = n ? n.sombra : "#B9B9C4";
  const fita = n ? n.fita : "#CFCFD8";
  const rotulo = n ? n.nome : "Medalha por conquistar";
  const acess = opcoes && opcoes.rotulo
    ? `role="img" aria-label="${rotulo}"`
    : `aria-hidden="true" focusable="false"`;
  const miolo = n
    ? `<polygon points="${pontosDaEstrela(50, 63, 14, 6.2)}" fill="#fff" stroke-width="3"/>`
    : `<text x="50" y="73" text-anchor="middle" font-family="'Luckiest Guy','Baloo 2',cursive"
             font-size="28" fill="#8B8B98" stroke="none">?</text>`;

  return `<svg class="medalha-svg${n ? "" : " por-conquistar"}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
      stroke="#14141A" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" ${acess}>
    <polygon points="27,3 47,3 55,40 37,42" fill="${fita}"/>
    <polygon points="73,3 53,3 45,40 63,42" fill="${fita}"/>
    <circle cx="50" cy="63" r="31" fill="${sombra}"/>
    <circle cx="50" cy="61" r="29" fill="${cor}"/>
    <circle cx="50" cy="61" r="21" fill="none" stroke="${sombra}" stroke-width="3"/>
    ${miolo}
    <path d="M31 50 Q36 39 47 37" fill="none" stroke="#fff" stroke-width="4" opacity=".85"/>
  </svg>`;
}

/* ===================================================================== */
/* 6.4 — Conquistas: catálogo de reserva                                  */
/* ===================================================================== */

/* Espelho fiel do seed de `conquistas` no schema.sql. É o que a galeria
   mostra quando o banco não responde. */
export const CONQUISTAS_PADRAO = Object.freeze([
  { codigo: "primeiro_passo", nome: "Primeiro passo", descricao: "Sua primeira fase concluída! Toda grande aventura começa assim.", icone: "🌱", cor: "#7ED957", criterio_tipo: "fases_concluidas", criterio_valor: 1, ordem: 1 },
  { codigo: "rumo_certo", nome: "Rumo certo", descricao: "Cinco fases concluídas: você já conhece o caminho.", icone: "🧭", cor: "#4CC9F0", criterio_tipo: "fases_concluidas", criterio_valor: 5, ordem: 2 },
  { codigo: "coroa_da_trilha", nome: "Coroa da trilha", descricao: "As dez fases da trilha principal concluídas. Que jornada!", icone: "👑", cor: "#FFD23F", criterio_tipo: "fases_principais_concluidas", criterio_valor: 10, ordem: 3 },
  { codigo: "lenda_math_kids", nome: "Lenda do Math Kids", descricao: "Todas as fases concluídas, incluindo as extras. Lendário!", icone: "🏆", cor: "#FFD400", criterio_tipo: "percentual_concluido", criterio_valor: 100, ordem: 4 },
  { codigo: "surpresa_extra", nome: "Surpresa extra", descricao: "Uma fase extra concluída: quem procura desafio, acha!", icone: "🎁", cor: "#B892FF", criterio_tipo: "fases_extras_concluidas", criterio_valor: 1, ordem: 5 },
  { codigo: "contra_o_relogio", nome: "Contra o relógio", descricao: "Uma fase com cronômetro concluída. Nem o relógio te segura!", icone: "⚡", cor: "#FF9A3D", criterio_tipo: "fases_cronometradas_concluidas", criterio_valor: 1, ordem: 6 },
  { codigo: "chuva_de_estrelas", nome: "Chuva de estrelas", descricao: "Dez estrelas na coleção. Está chovendo estrela!", icone: "⭐", cor: "#FFD23F", criterio_tipo: "estrelas_total", criterio_valor: 10, ordem: 7 },
  { codigo: "ceu_estrelado", nome: "Céu estrelado", descricao: "Vinte e cinco estrelas: dá para iluminar o céu inteiro.", icone: "🌟", cor: "#4CC9F0", criterio_tipo: "estrelas_total", criterio_valor: 25, ordem: 8 },
  { codigo: "brilho_dourado", nome: "Brilho dourado", descricao: "Sua primeira medalha de ouro. Como brilha!", icone: "🥇", cor: "#FFD400", criterio_tipo: "medalhas_ouro", criterio_valor: 1, ordem: 9 },
  { codigo: "colecao_dourada", nome: "Coleção dourada", descricao: "Cinco medalhas de ouro. Vai faltar prateleira!", icone: "🏅", cor: "#FF9A3D", criterio_tipo: "medalhas_ouro", criterio_valor: 5, ordem: 10 },
  { codigo: "tudo_certinho", nome: "Tudo certinho", descricao: "Uma fase inteira acertando todas de primeira.", icone: "💯", cor: "#FF6F91", criterio_tipo: "fases_perfeitas", criterio_valor: 1, ordem: 11 },
  { codigo: "pegando_fogo", nome: "Pegando fogo", descricao: "Cinco acertos seguidos na mesma fase. Que sequência!", icone: "🔥", cor: "#FF6F91", criterio_tipo: "melhor_combo", criterio_valor: 5, ordem: 12 },
  { codigo: "mil_pontos", nome: "Mil pontos", descricao: "Mil pontos somados. O placar não para de subir!", icone: "🎯", cor: "#2EC4B6", criterio_tipo: "pontos_total", criterio_valor: 1000, ordem: 13 },
  { codigo: "cofre_cheio", nome: "Cofre cheio", descricao: "Cinco mil pontos guardados. Haja cofrinho!", icone: "💰", cor: "#7ED957", criterio_tipo: "pontos_total", criterio_valor: 5000, ordem: 14 },
  { codigo: "nao_desisto", nome: "Não desisto nunca", descricao: "Dez partidas jogadas. Treinar é o que deixa a gente fera!", icone: "💪", cor: "#B892FF", criterio_tipo: "partidas_jogadas", criterio_valor: 10, ordem: 15 },
].map((c) => Object.freeze(c)));

const COR_PADRAO = "#FFD400";
const ICONE_PADRAO = "🏅";

/* ===================================================================== */
/* Utilitários tolerantes a lixo (mesmo espírito de js/conteudo.js)       */
/* ===================================================================== */

function comoTexto(v) {
  return typeof v === "string" ? v.trim() : "";
}

function comoNumero(v, padrao) {
  if (v === null || v === undefined || v === "") return padrao;
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
}

function comoInteiro(v, padrao) {
  const n = comoNumero(v, null);
  return n === null ? padrao : Math.trunc(n);
}

/* Campos que podem ser "ainda não sei" (erros, tempo): nulo continua nulo. */
function inteiroOuNulo(v) {
  const n = comoNumero(v, null);
  return n === null || n < 0 ? null : Math.trunc(n);
}

function comoData(v) {
  const s = comoTexto(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
}

export function formatarPontos(n) {
  const v = Math.max(0, comoInteiro(n, 0));
  try {
    return v.toLocaleString("pt-BR");
  } catch {
    return String(v); // ambiente sem tabela de idiomas: melhor sem ponto do que sem número
  }
}

/* ===================================================================== */
/* 6.4 — Métricas e motor de regras                                       */
/* ===================================================================== */

export const TIPOS_DE_CRITERIO = Object.freeze([
  "fases_concluidas",
  "fases_principais_concluidas",
  "fases_extras_concluidas",
  "fases_cronometradas_concluidas",
  "percentual_concluido",
  "estrelas_total",
  "pontos_total",
  "medalhas_ouro",
  "medalhas_prata",
  "fases_perfeitas",
  "melhor_combo",
  "partidas_jogadas",
]);

/*
  Espelho de metricas_do_avatar().
    linhas    o progresso da criança: mapa { fase: linha } ou lista de
              linhas no formato do espelho local (js/pontuacao.js)
    catalogo  as fases ativas: [{ id, extra, tempo }]
*/
export function calcularMetricas(linhas, catalogo) {
  const porId = new Map();
  for (const f of Array.isArray(catalogo) ? catalogo : []) {
    const id = comoInteiro(f?.id ?? f?.fase_id, null);
    if (id === null) continue;
    porId.set(id, { extra: !!f.extra, tempo: comoInteiro(f.tempo ?? f.tempo_seg, 0) });
  }

  const m = Object.fromEntries(TIPOS_DE_CRITERIO.map((t) => [t, 0]));
  let concluidasNoCatalogo = 0;

  const lista = Array.isArray(linhas) ? linhas : Object.values(linhas || {});
  for (const l of lista) {
    if (!l || typeof l !== "object") continue;
    const fase = porId.get(comoInteiro(l.fase ?? l.fase_id, null)) || null;
    const estrelas = Math.min(3, Math.max(0, comoInteiro(l.estrelas, 0)));
    const concluida = !!l.concluida || estrelas >= 1;
    const acertos = comoInteiro(l.melhor_acertos ?? l.acertos, 0);
    const total = comoInteiro(l.total_questoes, 0);
    const erros = inteiroOuNulo(l.erros);

    m.estrelas_total += estrelas;
    m.pontos_total += Math.max(0, comoInteiro(l.melhor_pontos ?? l.pontuacao, 0));
    m.partidas_jogadas += Math.max(0, comoInteiro(l.tentativas, 0));
    m.melhor_combo = Math.max(m.melhor_combo, comoInteiro(l.melhor_combo, 0));
    if (estrelas >= 3) m.medalhas_ouro++;
    if (estrelas >= 2) m.medalhas_prata++;

    if (!concluida) continue;
    m.fases_concluidas++;
    if (fase) concluidasNoCatalogo++;
    if (fase?.extra) m.fases_extras_concluidas++;
    else m.fases_principais_concluidas++;
    if (fase && fase.tempo > 0) m.fases_cronometradas_concluidas++;
    // erros === 0 só acontece acertando todas de primeira (ver calcularPartida)
    if (erros === 0 && total > 0 && acertos >= total) m.fases_perfeitas++;
  }

  m.percentual_concluido = porId.size ? Math.floor((100 * concluidasNoCatalogo) / porId.size) : 0;
  return m;
}

function criterioCumprido(conquista, metricas) {
  const valor = comoNumero(conquista?.criterio_valor, null);
  if (valor === null || valor <= 0) return false; // regra torta nunca desbloqueia sozinha
  return comoNumero(metricas?.[conquista.criterio_tipo], 0) >= valor;
}

/* O motor: devolve os códigos das conquistas que o avatar já merece. */
export function conquistasMerecidas(catalogo, metricas) {
  return (Array.isArray(catalogo) ? catalogo : [])
    .filter((c) => c && comoTexto(c.codigo) && criterioCumprido(c, metricas))
    .map((c) => c.codigo);
}

/* Junta catálogo + métricas + o que já foi desbloqueado no MESMO formato
   que conquistas_do_avatar() devolve. `desbloqueadas` = { codigo: dataISO }.
   Conquista é para sempre: quem está em `desbloqueadas` continua lá mesmo
   que a métrica caia ou a regra mude. */
export function montarConquistas(catalogo, metricas, desbloqueadas) {
  const ganhas = desbloqueadas || {};
  return (Array.isArray(catalogo) ? catalogo : [])
    .map((c, i) => normalizarConquista({
      ...c,
      valor_atual: comoNumero(metricas?.[c?.criterio_tipo], 0),
      desbloqueada: Object.prototype.hasOwnProperty.call(ganhas, c?.codigo),
      data_desbloqueio: ganhas[c?.codigo] || null,
    }, i))
    .filter(Boolean)
    .sort((a, b) => a.ordem - b.ordem);
}

/* ===================================================================== */
/* Normalização do que chega do banco                                     */
/* ===================================================================== */

/* Dado torto nunca quebra a galeria: conquista sem código ou sem nome é
   descartada; o resto ganha um padrão. */
export function normalizarConquista(bruta, indice) {
  if (!bruta || typeof bruta !== "object") return null;
  const codigo = comoTexto(bruta.codigo);
  const nome = comoTexto(bruta.nome);
  if (!codigo || !nome) return null;
  const alvo = comoNumero(bruta.criterio_valor, 0);
  return {
    id: comoInteiro(bruta.id, null),
    codigo,
    nome,
    descricao: comoTexto(bruta.descricao),
    icone: comoTexto(bruta.icone) || ICONE_PADRAO,
    cor: /^#[0-9a-f]{3,8}$/i.test(comoTexto(bruta.cor)) ? comoTexto(bruta.cor) : COR_PADRAO,
    criterio_tipo: comoTexto(bruta.criterio_tipo),
    criterio_valor: alvo > 0 ? alvo : 0,
    ordem: comoInteiro(bruta.ordem, (indice || 0) + 1),
    valor_atual: Math.max(0, comoNumero(bruta.valor_atual, 0)),
    desbloqueada: bruta.desbloqueada === true,
    data_desbloqueio: comoData(bruta.data_desbloqueio),
  };
}

export function normalizarConquistas(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((c, i) => normalizarConquista(c, i))
    .filter(Boolean)
    .sort((a, b) => a.ordem - b.ordem);
}

const STATUS_VALIDOS = ["concluida", "liberada", "bloqueada"];

function normalizarFaseDoPainel(bruta, indice) {
  if (!bruta || typeof bruta !== "object") return null;
  const id = comoInteiro(bruta.fase_id ?? bruta.id, null);
  if (id === null) return null;
  const estrelas = Math.min(3, Math.max(0, comoInteiro(bruta.estrelas, 0)));
  const concluida = bruta.concluida === true || estrelas >= 1;
  const status = STATUS_VALIDOS.includes(bruta.status)
    ? bruta.status
    : concluida ? "concluida" : "bloqueada";
  return {
    fase_id: id,
    ordem: comoInteiro(bruta.ordem, (indice || 0) + 1),
    nome: comoTexto(bruta.nome) || "Fase",
    icone: comoTexto(bruta.icone) || "🎯",
    cor: comoTexto(bruta.cor) || "#2EC4B6",
    extra: bruta.extra === true,
    status,
    concluida,
    estrelas,
    nivel_recompensa: nivelValido(bruta.nivel_recompensa, estrelas),
    pontuacao: Math.max(0, comoInteiro(bruta.pontuacao, 0)),
    acertos: Math.max(0, comoInteiro(bruta.acertos, 0)),
    erros: inteiroOuNulo(bruta.erros),
    total_questoes: Math.max(0, comoInteiro(bruta.total_questoes, 0)),
    tempo_gasto: inteiroOuNulo(bruta.tempo_gasto),
    melhor_combo: Math.max(0, comoInteiro(bruta.melhor_combo, 0)),
    tentativas: Math.max(0, comoInteiro(bruta.tentativas, 0)),
    data_conclusao: comoData(bruta.data_conclusao),
  };
}

/* Os números do topo do painel saem SEMPRE das listas — tanto no caminho
   offline quanto para conferir o que veio do banco. Mesmas regras de
   resumo_do_avatar(): pontuação total = soma da melhor de cada fase;
   fase atual = primeira liberada e ainda não concluída. */
export function montarResumo(fases, conquistas, pontuacaoTotal) {
  const trilha = Array.isArray(fases) ? fases : [];
  const medalhas = { ouro: 0, prata: 0, bronze: 0 };
  let concluidas = 0;
  let estrelas = 0;
  let pontos = 0;
  for (const f of trilha) {
    if (f.concluida) concluidas++;
    estrelas += f.estrelas;
    pontos += f.pontuacao;
    const nivel = nivelDaRecompensa(f.estrelas);
    if (nivel) medalhas[nivel]++;
  }
  const atual = trilha
    .filter((f) => !f.concluida && f.status === "liberada")
    .sort((a, b) => a.ordem - b.ordem)[0] || null;
  const lista = Array.isArray(conquistas) ? conquistas : [];

  return {
    fases_total: trilha.length,
    fases_concluidas: concluidas,
    estrelas,
    estrelas_max: trilha.length * 3,
    pontuacao_total: Math.max(0, comoInteiro(pontuacaoTotal, pontos)),
    medalhas,
    fase_atual: atual
      ? { fase_id: atual.fase_id, ordem: atual.ordem, nome: atual.nome, icone: atual.icone, cor: atual.cor }
      : null,
    conquistas_total: lista.length,
    conquistas_desbloqueadas: lista.filter((c) => c.desbloqueada).length,
  };
}

/*
  normalizarPainel(bruto) -> { resumo, fases, conquistas } | null

  Confere a resposta de painel_progresso. Devolve null quando não dá para
  confiar nela (não é objeto, ou veio sem nenhuma fase) — quem chama cai
  no painel montado localmente em vez de mostrar uma tela vazia.
*/
export function normalizarPainel(bruto) {
  if (!bruto || typeof bruto !== "object") return null;
  const fases = (Array.isArray(bruto.fases) ? bruto.fases : [])
    .map((f, i) => normalizarFaseDoPainel(f, i))
    .filter(Boolean)
    .sort((a, b) => a.ordem - b.ordem);
  if (!fases.length) return null;

  const conquistas = normalizarConquistas(bruto.conquistas);
  const r = bruto.resumo && typeof bruto.resumo === "object" ? bruto.resumo : {};
  return {
    resumo: montarResumo(fases, conquistas, comoNumero(r.pontuacao_total, null)),
    fases,
    conquistas,
  };
}

/* Resposta de registrar_resultado_fase -> o que a tela de fim usa. */
export function normalizarResultado(bruto) {
  if (!bruto || typeof bruto !== "object") return null;
  const p = bruto.partida;
  if (!p || typeof p !== "object") return null;
  const estrelas = Math.min(3, Math.max(0, comoInteiro(p.estrelas, 0)));
  const g = bruto.progresso && typeof bruto.progresso === "object" ? bruto.progresso : {};
  return {
    partida: {
      pontos: Math.max(0, comoInteiro(p.pontuacao, 0)),
      acertos: Math.max(0, comoInteiro(p.acertos, 0)),
      erros: inteiroOuNulo(p.erros),
      total: Math.max(0, comoInteiro(p.total_questoes, 0)),
      tempoGasto: inteiroOuNulo(p.tempo_gasto),
      melhorCombo: Math.max(0, comoInteiro(p.melhor_combo, 0)),
      estrelas,
      nivel: nivelValido(p.nivel_recompensa, estrelas),
      recorde: p.recorde === true,
      primeiraConclusao: p.primeira_conclusao === true,
      subiuDeMedalha: p.subiu_de_medalha === true,
    },
    progresso: {
      fase: comoInteiro(g.fase_id, null),
      estrelas: Math.min(3, Math.max(0, comoInteiro(g.estrelas, estrelas))),
      melhor_pontos: Math.max(0, comoInteiro(g.pontuacao, 0)),
      melhor_acertos: Math.max(0, comoInteiro(g.acertos, 0)),
      total_questoes: Math.max(0, comoInteiro(g.total_questoes, 0)),
      concluida: g.concluida === true,
      tentativas: Math.max(0, comoInteiro(g.tentativas, 0)),
      erros: inteiroOuNulo(g.erros),
      tempo_gasto: inteiroOuNulo(g.tempo_gasto),
      melhor_combo: Math.max(0, comoInteiro(g.melhor_combo, 0)),
      data_conclusao: comoData(g.data_conclusao),
    },
    novasConquistas: normalizarConquistas(bruto.novas_conquistas),
  };
}

/* ===================================================================== */
/* 6.7 — Painel montado no navegador (plano B)                            */
/* ===================================================================== */

/* Junta a fase do menu (js/conteudo.js, já com status e estrelas) com a
   linha do espelho local, que é quem sabe erros, tempo e combo. */
function faseDoPainelLocal(f, linha, indice) {
  const l = linha || {};
  return normalizarFaseDoPainel({
    fase_id: f.id,
    ordem: f.ordem || indice + 1,
    nome: f.nome,
    icone: f.icone || f.emoji,
    cor: f.cor,
    extra: f.extra === true,
    status: f.status,
    concluida: f.concluida === true,
    estrelas: f.estrelas,
    pontuacao: f.melhor_pontos,
    acertos: l.melhor_acertos,
    erros: l.erros,
    total_questoes: f.qtd_questoes ?? f.qtdQuestoes,
    tempo_gasto: l.tempo_gasto,
    melhor_combo: l.melhor_combo,
    tentativas: l.tentativas,
    data_conclusao: l.data_conclusao,
  }, indice);
}

/*
  montarPainelLocal({ fases, progresso, desbloqueadas, catalogo })
    -> { resumo, fases, conquistas, merecidas }

  O MESMO formato de painel_progresso, feito com o que o navegador tem:
    fases          a trilha de listarFasesComStatus (js/conteudo.js)
    progresso      o espelho local { fase: linha } (js/progresso.js)
    desbloqueadas  { codigo: dataISO } já guardadas neste dispositivo
    catalogo       conquistas (padrão: CONQUISTAS_PADRAO)

  `merecidas` lista os códigos que o motor aprova AGORA — quem chama usa
  para guardar as que ainda não estavam em `desbloqueadas`.
*/
export function montarPainelLocal(entrada) {
  const e = entrada || {};
  const progresso = e.progresso || {};
  const catalogo = Array.isArray(e.catalogo) && e.catalogo.length ? e.catalogo : CONQUISTAS_PADRAO;

  const fases = (Array.isArray(e.fases) ? e.fases : [])
    .map((f, i) => faseDoPainelLocal(f, progresso[f.id], i))
    .filter(Boolean)
    .sort((a, b) => a.ordem - b.ordem);

  /* As métricas saem do que a TELA mostra (a fase do menu manda em
     estrelas e pontos), completadas pelo espelho local. */
  const linhas = fases.map((f) => ({
    fase: f.fase_id,
    estrelas: f.estrelas,
    concluida: f.concluida,
    melhor_pontos: f.pontuacao,
    melhor_acertos: f.acertos,
    total_questoes: f.total_questoes,
    erros: f.erros,
    melhor_combo: f.melhor_combo,
    tentativas: f.tentativas,
  }));
  const metricas = calcularMetricas(linhas, e.fases);
  const merecidas = conquistasMerecidas(catalogo, metricas);

  const ganhas = { ...(e.desbloqueadas || {}) };
  const agora = e.agora || new Date().toISOString();
  for (const codigo of merecidas) if (!ganhas[codigo]) ganhas[codigo] = agora;

  const conquistas = montarConquistas(catalogo, metricas, ganhas);
  return { resumo: montarResumo(fases, conquistas), fases, conquistas, merecidas, metricas };
}

/* ===================================================================== */
/* Pequenas contas que as telas usam                                      */
/* ===================================================================== */

/* Quanto falta para a conquista, de 0 a 1 — para a barrinha da galeria. */
export function fracaoDaConquista(c) {
  if (!c) return 0;
  if (c.desbloqueada) return 1;
  if (!(c.criterio_valor > 0)) return 0;
  return Math.min(1, Math.max(0, c.valor_atual / c.criterio_valor));
}

/* "3 de 5", "640 de 1.000", "54%" — sem número que a criança não entenda. */
export function textoDoProgresso(c) {
  if (!c || !(c.criterio_valor > 0)) return "";
  if (c.criterio_tipo === "percentual_concluido") {
    return `${Math.min(100, Math.floor(c.valor_atual))}%`;
  }
  const atual = Math.min(c.valor_atual, c.criterio_valor);
  return `${formatarPontos(atual)} de ${formatarPontos(c.criterio_valor)}`;
}

/* A próxima conquista ainda bloqueada de um tipo (a de menor alvo). O
   painel usa como "próximo objetivo" em vez de inventar uma escada própria
   de metas — quem define a meta é o catálogo, que é dado. */
export function proximoObjetivo(conquistas, tipo) {
  return (Array.isArray(conquistas) ? conquistas : [])
    .filter((c) => !c.desbloqueada && c.criterio_tipo === tipo && c.criterio_valor > 0)
    .sort((a, b) => a.criterio_valor - b.criterio_valor)[0] || null;
}

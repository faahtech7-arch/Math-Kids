/*
  =========================================================================
  Math Kids — Camada de conteúdo (Épico 3)
  =========================================================================
  Aqui mora TODO o conteúdo pedagógico que o jogo mostra: a lista de fases
  (com status de progressão) e os problemas de cada fase. O banco (Supabase)
  é a fonte de verdade quando está disponível; quando não está, este módulo
  devolve exatamente a mesma coisa montada a partir de js/fases.js e
  js/gerador.js. Ou seja: a regra de ouro do projeto vale aqui também —
  se o Supabase cair, o jogo continua jogável, só que com conteúdo local.

    listarFasesComStatus(token)   -> { fases, origem, erro }
    carregarConteudoDaFase(id, o) -> { fase, problemas, origem, erro, avisos }
    normalizarProblema(bruto, f)  -> Questao | null
    criarFonteDeProblemas(f, ps)  -> { proxima, servidos, total, origem }
    lembrarServidos(id, ids) / ultimosServidos(id)

  Duas decisões de projeto que parecem estranhas mas são de propósito:

  1) O import do Supabase é DINÂMICO e dentro de try/catch. Este arquivo é
     importado pelo teste ferramentas/testar-conteudo.mjs, que roda no Node
     sem rede e sem npm — e js/supabaseClient.js importa a biblioteca de uma
     URL https://, o que explode fora do navegador. Com o import dinâmico o
     erro vira simplesmente "sem Supabase" e o caminho local é exercitado.

  2) Nada aqui lança exceção para quem chama. Dado malformado vira `null`,
     API fora do ar vira `erro` preenchido + conteúdo local. Quem está do
     outro lado da tela é uma criança: ela não pode ver uma tela quebrada
     porque uma linha do banco veio com um campo faltando.

  Formato de uma Questao (superset do que js/gerador.js devolve — `partes`
  é OBRIGATÓRIO porque js/dicas.js monta a dica educativa em cima dele):
    { id, texto, partes, resposta, respostaStr, slots, enunciado,
      visual: { emoji, tema, cor, alt }, operacao, dificuldade, origem }
  =========================================================================
*/
import { TODAS_FASES, acharFase, faseLiberada, META_PADRAO } from "./fases.js";
import { criarGeradorDeFase } from "./gerador.js";

/* Sinal bonito para exibição — o MESMO de gerador.js e dicas.js.
   Nas `partes` o operador é sempre ASCII ("+", "-", "*", "/"); o "×" e o
   "÷" só aparecem no texto que a criança lê. */
const SINAL = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const OPERADORES = ["+", "-", "*", "/"];
const STATUS_VALIDOS = ["concluida", "liberada", "bloqueada"];

/* Ilustração de reserva quando o banco não mandou `elementos_visuais`.
   Uma questão sem emoji fica sem graça, mas uma questão que quebra a tela
   fica pior — então sempre existe um padrão por operação. */
const VISUAL_PADRAO = {
  "+": { emoji: "🍎", tema: "frutas", alt: "maçãs" },
  "-": { emoji: "🍪", tema: "lanche", alt: "biscoitos" },
  "*": { emoji: "🧁", tema: "festa", alt: "cupcakes" },
  "/": { emoji: "🍕", tema: "pizza", alt: "fatias de pizza" },
  misto: { emoji: "🎲", tema: "jogos", alt: "peças" },
};

const COR_PADRAO = "#2EC4B6";
const PREFIXO_SERVIDOS = "mathkids.servidos.";
const LIMITE_SERVIDOS = 40; // guardar demais faria p_excluir esvaziar o acervo da fase

/* Ids locais precisam ser únicos dentro da aba inteira: o mesmo contador
   serve o pré-preenchimento e o "top-up" da fonte de problemas. */
let contadorLocal = 0;

/* ===================================================================== */
/* Utilitários pequenos (todos tolerantes a lixo)                        */
/* ===================================================================== */

function comoTexto(v) {
  return typeof v === "string" ? v.trim() : "";
}

function comoInteiro(v, padrao) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : padrao;
}

function comoNumero(v, padrao) {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
}

/* jsonb costuma chegar como objeto, mas um cliente antigo pode entregar
   a string crua — então tentamos o parse antes de desistir. */
function comoObjeto(v) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v;
  if (typeof v === "string" && v.trim()) {
    try {
      const o = JSON.parse(v);
      return o && typeof o === "object" && !Array.isArray(o) ? o : null;
    } catch {
      return null;
    }
  }
  return null;
}

function mensagemDeErro(e) {
  if (!e) return null;
  return comoTexto(e.message) || comoTexto(e.hint) || String(e);
}

/* Fisher-Yates: embaralhamento de verdade, sem sort(() => Math.random()). */
function embaralhar(lista) {
  const a = lista.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ===================================================================== */
/* Ponte com o Supabase — nunca lança, nunca derruba o teste em Node      */
/* ===================================================================== */

let clientePromessa = null;

/* Carrega o cliente UMA vez. Fora do navegador (ou sem CDN) o import
   rejeita; guardamos a promessa resolvida em `null` para não tentar de
   novo a cada questão. */
function obterCliente() {
  if (!clientePromessa) {
    clientePromessa = import("./supabaseClient.js")
      .then((m) => m?.supabase || null)
      .catch(() => null);
  }
  return clientePromessa;
}

/*
  Chama uma RPC e devolve SEMPRE { data, error } — nunca lança.
  `error` vem preenchido tanto quando o Postgres recusa (ex.: "Sessão
  inválida ou expirada") quanto quando não há Supabase nenhum.
*/
async function rpc(nome, args) {
  try {
    const supabase = await obterCliente();
    if (!supabase) return { data: null, error: new Error("Supabase indisponível neste ambiente.") };
    const { data, error } = await supabase.rpc(nome, args || {});
    return { data: data ?? null, error: error || null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/* O progresso já tem espelho offline em js/progresso.js — reaproveitamos
   em vez de reimplementar. O import é dinâmico pelo mesmo motivo do
   Supabase: progresso.js importa supabaseClient.js no topo. */
async function obterProgresso(token) {
  if (!token) return {};
  try {
    const { carregarProgresso } = await import("./progresso.js");
    return (await carregarProgresso(token)) || {};
  } catch {
    return {}; // sem rede/sem browser: segue sem progresso, tudo liberado pelo caminho local
  }
}

/* ===================================================================== */
/* FaseView — o objeto que as telas consomem                             */
/* ===================================================================== */

/*
  Monta o FaseView com os nomes NOVOS (do banco) e os ANTIGOS ao mesmo
  tempo. jogar.js e partida.js já usam `emoji`, `qtdQuestoes`, `tempo` e
  `meta.uma`; o banco fala `icone`, `qtd_questoes`, `tempo_seg` e
  `meta_uma`. Manter os dois evita mexer em código que já funciona.
*/
function montarFaseView(c) {
  const meta = {
    uma: comoNumero(c.metaUma, META_PADRAO.uma),
    duas: comoNumero(c.metaDuas, META_PADRAO.duas),
    tres: comoNumero(c.metaTres, META_PADRAO.tres),
  };
  const qtdQuestoes = Math.max(1, comoInteiro(c.qtdQuestoes, 8));
  const tempo = Math.max(0, comoInteiro(c.tempo, 0));
  const icone = comoTexto(c.icone) || "🎯";
  const estrelas = Math.min(3, Math.max(0, comoInteiro(c.estrelas, 0)));

  return {
    id: comoInteiro(c.id, 0),
    ordem: comoInteiro(c.ordem, 0),
    nome: comoTexto(c.nome) || "Fase",
    icone,
    emoji: icone, // alias antigo
    cor: comoTexto(c.cor) || COR_PADRAO,
    operacao_principal: c.operacaoPrincipal,
    dificuldade: Math.min(5, Math.max(1, comoInteiro(c.dificuldade, 1))),
    dica: comoTexto(c.dica),
    qtd_questoes: qtdQuestoes,
    qtdQuestoes, // alias antigo
    tentativas: Math.max(1, comoInteiro(c.tentativas, 3)),
    tempo_seg: tempo,
    tempo, // alias antigo
    meta,
    extra: !!c.extra,
    regras: comoObjeto(c.regras) || {},
    total_problemas: Math.max(0, comoInteiro(c.totalProblemas, 0)),
    status: STATUS_VALIDOS.includes(c.status) ? c.status : null,
    estrelas,
    melhor_pontos: Math.max(0, comoInteiro(c.melhorPontos, 0)),
    concluida: !!c.concluida || estrelas >= 1,
    /* Campos extras que o gerador local precisa (js/gerador.js lê
       `operacoes`, `regras` e `parcelas`). Não aparecem no banco, mas
       deixam o FaseView pronto para virar fallback sem conversão. */
    operacoes: Array.isArray(c.operacoes) && c.operacoes.length ? c.operacoes : ["+"],
    parcelas: Math.max(2, comoInteiro(c.parcelas, 2)),
  };
}

/* Descobre quais operações a fase usa: primeiro pelas chaves de `regras`
   (é o que o gerador entende), depois pela operação principal. */
function operacoesDaFase(regras, operacaoPrincipal, local) {
  if (local && Array.isArray(local.operacoes) && local.operacoes.length) return local.operacoes.slice();
  const daRegra = Object.keys(regras || {}).filter((k) => OPERADORES.includes(k));
  if (daRegra.length) return daRegra;
  if (OPERADORES.includes(operacaoPrincipal)) return [operacaoPrincipal];
  return ["+"];
}

/* Linha vinda de listar_fases / listar_fases_progresso -> FaseView. */
function faseViewRemota(linha) {
  const id = comoInteiro(linha?.id, 0);
  const local = acharFase(id); // espelho local: completa o que vier faltando
  const regras = comoObjeto(linha?.regras) || local?.regras || {};
  const operacaoPrincipal = comoTexto(linha?.operacao_principal) || null;

  return montarFaseView({
    id,
    ordem: comoInteiro(linha?.ordem, 0),
    nome: comoTexto(linha?.nome) || local?.nome,
    icone: comoTexto(linha?.icone) || local?.emoji,
    cor: comoTexto(linha?.cor) || local?.cor,
    operacaoPrincipal,
    dificuldade: comoInteiro(linha?.dificuldade, 1),
    dica: comoTexto(linha?.dica) || local?.dica,
    qtdQuestoes: comoInteiro(linha?.qtd_questoes, local?.qtdQuestoes ?? 8),
    tentativas: comoInteiro(linha?.tentativas, local?.tentativas ?? 3),
    tempo: comoInteiro(linha?.tempo_seg, local?.tempo ?? 0),
    metaUma: comoNumero(linha?.meta_uma, local?.meta?.uma ?? META_PADRAO.uma),
    metaDuas: comoNumero(linha?.meta_duas, local?.meta?.duas ?? META_PADRAO.duas),
    metaTres: comoNumero(linha?.meta_tres, local?.meta?.tres ?? META_PADRAO.tres),
    extra: linha?.extra ?? local?.extra ?? false,
    regras,
    totalProblemas: comoInteiro(linha?.total_problemas, 0),
    status: comoTexto(linha?.status),
    estrelas: comoInteiro(linha?.estrelas, 0),
    melhorPontos: comoInteiro(linha?.melhor_pontos, 0),
    concluida: !!linha?.concluida,
    operacoes: operacoesDaFase(regras, operacaoPrincipal, local),
    parcelas: local?.parcelas ?? 2,
  });
}

/* Fase de js/fases.js -> FaseView, com status calculado pela regra local
   de progressão (faseLiberada). É este o caminho quando o Supabase cai. */
function faseViewLocal(fase, progresso, ordem) {
  const linha = progresso?.[fase.id] || null;
  const estrelas = comoInteiro(linha?.estrelas, 0);
  const concluida = !!linha?.concluida || estrelas >= 1;
  const liberada = faseLiberada(fase.id, progresso || {});
  const operacoes = Array.isArray(fase.operacoes) ? fase.operacoes : ["+"];

  return montarFaseView({
    id: fase.id,
    ordem: comoInteiro(ordem, 0),
    nome: fase.nome,
    icone: fase.emoji,
    cor: fase.cor,
    operacaoPrincipal: operacoes.length === 1 ? operacoes[0] : "misto",
    /* Sem banco não existe coluna `dificuldade`: a posição na trilha é a
       melhor aproximação da curva (1..5). */
    dificuldade: Math.min(5, Math.max(1, Math.ceil(comoInteiro(ordem, 1) / 3))),
    dica: fase.dica,
    qtdQuestoes: fase.qtdQuestoes,
    tentativas: fase.tentativas,
    tempo: fase.tempo,
    metaUma: fase.meta?.uma,
    metaDuas: fase.meta?.duas,
    metaTres: fase.meta?.tres,
    extra: !!fase.extra,
    regras: fase.regras,
    totalProblemas: 0, // acervo local é gerado na hora, não tem "total"
    status: concluida ? "concluida" : liberada ? "liberada" : "bloqueada",
    estrelas,
    melhorPontos: comoInteiro(linha?.melhor_pontos, 0),
    concluida,
    operacoes,
    parcelas: fase.parcelas ?? 2,
  });
}

/* Preenche status/estrelas que a RPC não trouxe, usando a mesma regra do
   back-end (seção 3 do contrato): ordem 1 sempre liberada; ordem N+1
   libera quando a de ordem N está concluída. */
function aplicarStatusPorOrdem(fases, progresso) {
  const ordenadas = fases.slice().sort((a, b) => a.ordem - b.ordem);
  let anteriorConcluida = true; // a primeira da trilha nunca fica bloqueada
  for (const f of ordenadas) {
    const linha = progresso?.[f.id] || null;
    const estrelas = Math.max(f.estrelas || 0, comoInteiro(linha?.estrelas, 0));
    const concluida = f.concluida || !!linha?.concluida || estrelas >= 1;
    f.estrelas = estrelas;
    f.melhor_pontos = Math.max(f.melhor_pontos || 0, comoInteiro(linha?.melhor_pontos, 0));
    f.concluida = concluida;
    if (!f.status) {
      f.status = concluida ? "concluida" : anteriorConcluida ? "liberada" : "bloqueada";
    }
    anteriorConcluida = concluida;
  }
  return fases;
}

/* ===================================================================== */
/* 1) Lista de fases com status                                          */
/* ===================================================================== */

/*
  listarFasesComStatus(token)
    -> { fases: [FaseView], origem: "supabase" | "local", erro: string|null }

  Ordem de tentativa: RPC com progresso -> RPC pública + progresso local
  -> js/fases.js. NUNCA lança: no pior caso devolve as 13 fases locais.
*/
export async function listarFasesComStatus(token) {
  const t = comoTexto(token);
  let erro = null;

  // 1) Com token, o servidor já calcula status/estrelas/concluída.
  if (t) {
    const r = await rpc("listar_fases_progresso", { p_token: t });
    if (!r.error && Array.isArray(r.data) && r.data.length) {
      const fases = r.data.map(faseViewRemota);
      if (fases.some((f) => !f.status)) {
        aplicarStatusPorOrdem(fases, await obterProgresso(t));
      }
      return { fases, origem: "supabase", erro: null };
    }
    /* Guardamos a mensagem original: quem chama testa por
       .includes("Sessão") para mandar a criança fazer login de novo. */
    erro = mensagemDeErro(r.error);
  }

  // 2) Sem token (ou token recusado): a lista de fases é pública.
  const publica = await rpc("listar_fases", {});
  if (!publica.error && Array.isArray(publica.data) && publica.data.length) {
    const fases = publica.data.map(faseViewRemota);
    aplicarStatusPorOrdem(fases, await obterProgresso(t));
    return { fases, origem: "supabase", erro };
  }

  // 3) Fallback total: as fases de js/fases.js, na mesma ordem do seed.
  const progresso = await obterProgresso(t);
  const fases = TODAS_FASES.map((f, i) => faseViewLocal(f, progresso, i + 1));
  return {
    fases,
    origem: "local",
    erro: erro || mensagemDeErro(publica.error) || "Não consegui falar com o Supabase.",
  };
}

/* ===================================================================== */
/* 2) Normalização de um problema do banco                               */
/* ===================================================================== */

/* Calcula a conta da esquerda para a direita, igual a criança faz.
   Devolve null quando a conta não fecha (divisão não exata, operador
   desconhecido, divisão por zero). */
function calcularEsquerdaDireita(partes) {
  let acc = partes[0];
  for (let i = 1; i < partes.length; i += 2) {
    const op = partes[i];
    const b = partes[i + 1];
    if (op === "+") acc += b;
    else if (op === "-") acc -= b;
    else if (op === "*") acc *= b;
    else if (op === "/") {
      if (b === 0 || acc % b !== 0) return null; // divisão tem que ser exata
      acc /= b;
    } else return null;
  }
  return Number.isInteger(acc) ? acc : null;
}

function textoDaConta(partes) {
  return partes.map((p) => (typeof p === "string" ? SINAL[p] || p : p)).join(" ") + " =";
}

/* A operação que a fonte usa para não repetir o mesmo tipo de conta duas
   vezes seguidas. Conta com mais de um operador vira "misto". */
function operacaoDasPartes(partes) {
  const ops = [];
  for (let i = 1; i < partes.length; i += 2) {
    if (!ops.includes(partes[i])) ops.push(partes[i]);
  }
  return ops.length === 1 ? ops[0] : "misto";
}

function visualDaQuestao(bruto, fase, operacao) {
  const vis = comoObjeto(bruto?.elementos_visuais) || {};
  const padrao = VISUAL_PADRAO[operacao] || VISUAL_PADRAO.misto;
  const tema = comoTexto(vis.tema) || comoTexto(bruto?.tema) || padrao.tema;
  return {
    emoji: comoTexto(vis.emoji) || padrao.emoji,
    tema,
    cor: comoTexto(vis.cor) || comoTexto(fase?.cor) || COR_PADRAO,
    alt: comoTexto(vis.alt) || padrao.alt,
  };
}

/*
  normalizarProblema(bruto, fase) -> Questao | null

  Paranoico de propósito: QUALQUER coisa fora do formato devolve `null`
  em vez de lançar. Quem chama só descarta o item e completa o acervo com
  o gerador local — a criança nunca vê o problema quebrado.

  Vira null quando: `dados` some ou não é objeto; `partes` não é array com
  tamanho ímpar >= 3; algum número não é inteiro finito; algum operador
  está fora de + - * /; `resposta_correta` não é inteiro entre 0 e 99; ou
  a resposta não bate com o cálculo das partes (esquerda -> direita).
*/
export function normalizarProblema(bruto, fase) {
  try {
    if (!bruto || typeof bruto !== "object") return null;

    const dados = comoObjeto(bruto.dados);
    if (!dados) return null;

    const partes = dados.partes;
    if (!Array.isArray(partes) || partes.length < 3 || partes.length % 2 === 0) return null;

    // posições pares são números, ímpares são operadores — sem coerção:
    // a string "14" é dado malformado, e js/dicas.js faz conta com isso.
    for (let i = 0; i < partes.length; i++) {
      if (i % 2 === 0) {
        if (typeof partes[i] !== "number" || !Number.isFinite(partes[i]) || !Number.isInteger(partes[i])) return null;
      } else if (!OPERADORES.includes(partes[i])) {
        return null;
      }
    }

    const resposta = bruto.resposta_correta;
    if (typeof resposta !== "number" || !Number.isInteger(resposta) || resposta < 0 || resposta > 99) return null;

    const conferida = calcularEsquerdaDireita(partes);
    if (conferida === null || conferida !== resposta) return null;

    /* `expressao` é só exibição. Se faltar — ou se não combinar com as
       partes — reconstruímos: as partes são a fonte de verdade. */
    let texto = comoTexto(dados.expressao);
    if (texto) {
      const numerosNoTexto = (texto.match(/\d+/g) || []).join(",");
      const numerosDasPartes = partes.filter((_, i) => i % 2 === 0).join(",");
      if (numerosNoTexto !== numerosDasPartes) texto = "";
    }
    if (!texto) texto = textoDaConta(partes);

    const operacao = operacaoDasPartes(partes);
    const respostaStr = String(resposta);
    const id = comoTexto(bruto.id) || `problema-${++contadorLocal}`;

    return {
      id,
      texto,
      partes: partes.slice(), // cópia: ninguém mexe no array do banco sem querer
      resposta,
      respostaStr,
      slots: respostaStr.length, // 1 ou 2 quadradinhos na tela
      enunciado: comoTexto(bruto.enunciado),
      visual: visualDaQuestao(bruto, fase, operacao),
      operacao,
      dificuldade: Math.min(5, Math.max(1, comoInteiro(bruto.dificuldade, 1))),
      origem: "supabase",
    };
  } catch {
    return null; // promessa do contrato: normalizar NUNCA lança
  }
}

/* ===================================================================== */
/* 3) Gerador local (o fallback de sempre)                               */
/* ===================================================================== */

/* js/gerador.js espera { operacoes, regras, parcelas }. Quando a fase
   existe em js/fases.js usamos a config local inteira — é o espelho mais
   confiável das regras de dificuldade. */
function configDoGerador(fase) {
  const local = acharFase(fase?.id);
  if (local) return local;
  const regras = comoObjeto(fase?.regras) || {};
  return {
    id: fase?.id,
    nome: fase?.nome,
    operacoes: operacoesDaFase(regras, fase?.operacao_principal, null),
    regras,
    parcelas: Math.max(2, comoInteiro(fase?.parcelas, 2)),
  };
}

/* Envelopa a conta crua do gerador no formato Questao. */
function questaoLocal(conta, fase) {
  const operacao = operacaoDasPartes(conta.partes);
  const padrao = VISUAL_PADRAO[operacao] || VISUAL_PADRAO.misto;
  const respostaStr = String(conta.resposta);
  return {
    id: `local-${++contadorLocal}`,
    texto: conta.texto,
    partes: conta.partes.slice(),
    resposta: conta.resposta,
    respostaStr,
    slots: respostaStr.length,
    enunciado: "", // o gerador local não contextualiza; a tela esconde o bloco
    visual: {
      emoji: padrao.emoji,
      tema: padrao.tema,
      cor: comoTexto(fase?.cor) || COR_PADRAO,
      alt: padrao.alt,
    },
    operacao,
    dificuldade: Math.min(5, Math.max(1, comoInteiro(fase?.dificuldade, 1))),
    origem: "local",
  };
}

/* Última linha de defesa: se até o gerador falhar (regras corrompidas,
   por exemplo), ainda assim entregamos uma soma simples. Melhor uma conta
   fácil do que uma tela travada. */
function questaoDeEmergencia(fase) {
  const a = 1 + Math.floor(Math.random() * 9);
  const b = 1 + Math.floor(Math.random() * 9);
  return questaoLocal({ partes: [a, "+", b], resposta: a + b, texto: textoDaConta([a, "+", b]) }, fase);
}

/* Devolve uma função proxima() que nunca lança. */
function criarGeradorSeguro(fase) {
  let gerar = null;
  try {
    gerar = criarGeradorDeFase(configDoGerador(fase));
  } catch {
    gerar = null;
  }
  return function proximaLocal() {
    if (gerar) {
      try {
        return questaoLocal(gerar(), fase);
      } catch {
        gerar = null; // gerador quebrado: não insiste, cai na emergência
      }
    }
    return questaoDeEmergencia(fase);
  };
}

/* Gera `quantidade` questões locais sem repetir texto já visto. */
function gerarLocais(fase, quantidade, textosUsados) {
  const proxima = criarGeradorSeguro(fase);
  const saida = [];
  for (let i = 0; i < quantidade; i++) {
    let q = null;
    // algumas tentativas para não repetir conta; depois aceita o que veio
    for (let tent = 0; tent < 12; tent++) {
      const cand = proxima();
      if (!textosUsados.has(cand.texto)) { q = cand; break; }
      q = cand;
    }
    textosUsados.add(q.texto);
    saida.push(q);
  }
  return saida;
}

/* ===================================================================== */
/* 4) Conteúdo de uma fase                                               */
/* ===================================================================== */

/* p_excluir é uuid[] no Postgres: mandar "local-7" quebraria o cast e
   derrubaria a RPC inteira. Filtramos antes de enviar. */
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
  carregarConteudoDaFase(faseId, { token, quantidade, excluir })
    -> { fase: FaseView|null, problemas: [Questao],
         origem: "supabase" | "misto" | "local", erro, avisos: [] }

  Sempre devolve um objeto útil e nunca lança:
    - banco OK e com acervo suficiente  -> origem "supabase"
    - banco OK com acervo curto/vazio   -> completa com o gerador -> "misto"
    - banco fora do ar / RPC inexistente-> tudo local -> "local" + `erro`
*/
export async function carregarConteudoDaFase(faseId, opcoes) {
  const o = opcoes || {};
  const id = comoInteiro(faseId, 0);
  const token = comoTexto(o.token);
  const avisos = [];
  let erro = null;

  // --- a fase (com status). listarFasesComStatus já embute o fallback.
  const listagem = await listarFasesComStatus(token);
  if (listagem.erro) erro = listagem.erro;

  let fase = listagem.fases.find((f) => f.id === id) || null;
  if (!fase) {
    const local = acharFase(id);
    if (local) {
      fase = faseViewLocal(local, await obterProgresso(token), 0);
      avisos.push("Fase não veio na listagem; usando a configuração local.");
    }
  }
  if (!fase) {
    return {
      fase: null,
      problemas: [],
      origem: "local",
      erro: erro || `Fase ${faseId} não existe.`,
      avisos,
    };
  }

  const quantidade = Math.max(1, comoInteiro(o.quantidade, fase.qtd_questoes));
  const excluir = (Array.isArray(o.excluir) ? o.excluir : [])
    .map(comoTexto)
    .filter((s) => RE_UUID.test(s));

  // --- os problemas. Só vale tentar se a listagem veio do banco.
  let brutos = [];
  if (listagem.origem === "supabase") {
    const sorteio = await rpc("sortear_problemas", {
      p_fase_id: id,
      p_quantidade: quantidade,
      p_excluir: excluir,
    });
    if (sorteio.error) {
      /* A base pode estar com o schema antigo (sem sortear_problemas):
         antes de desistir, tentamos a RPC que devolve a fase inteira. */
      const completa = await rpc("obter_fase", { p_fase_id: id });
      if (completa.error) erro = erro || mensagemDeErro(sorteio.error);
      else brutos = completa.data?.problemas || [];
    } else {
      brutos = sorteio.data || [];
    }
  }

  // --- normaliza, descartando o que veio torto
  const problemas = [];
  const textosUsados = new Set();
  let descartados = 0;
  for (const bruto of Array.isArray(brutos) ? brutos : []) {
    const q = normalizarProblema(bruto, fase);
    if (!q) { descartados++; continue; }
    if (textosUsados.has(q.texto)) continue; // a RPC não deveria repetir, mas conferimos
    textosUsados.add(q.texto);
    problemas.push(q);
  }
  if (descartados) {
    avisos.push(`${descartados} problema(s) do banco vieram fora do formato e foram ignorados.`);
  }

  // --- completa o que faltar com o gerador local
  const doBanco = problemas.length;
  if (doBanco < quantidade) {
    const faltam = quantidade - doBanco;
    problemas.push(...gerarLocais(fase, faltam, textosUsados));
    if (doBanco > 0) {
      avisos.push(`O banco tinha ${doBanco} problema(s) para esta fase; completei ${faltam} com o gerador local.`);
    }
  }

  const origem = doBanco === 0 ? "local" : doBanco < quantidade ? "misto" : "supabase";
  return { fase, problemas, origem, erro, avisos };
}

/* ===================================================================== */
/* 5) Fonte de problemas — quem decide a ordem em que a criança vê        */
/* ===================================================================== */

function ehQuestao(q) {
  return !!q && typeof q === "object" && Array.isArray(q.partes) &&
    Number.isInteger(q.resposta) && typeof q.texto === "string";
}

/* Fila com curva de dificuldade preservada: agrupa por dificuldade,
   embaralha DENTRO de cada grupo e concatena em ordem crescente. Assim a
   fase começa fácil e termina puxada, mas não é a mesma sequência toda
   vez que a criança joga. */
function filaPorDificuldade(acervo) {
  const grupos = new Map();
  for (const q of acervo) {
    const d = Number.isInteger(q.dificuldade) ? q.dificuldade : 1;
    if (!grupos.has(d)) grupos.set(d, []);
    grupos.get(d).push(q);
  }
  const fila = [];
  for (const d of [...grupos.keys()].sort((a, b) => a - b)) {
    fila.push(...embaralhar(grupos.get(d)));
  }
  return fila;
}

/*
  criarFonteDeProblemas(fase, problemas)
    -> { proxima(): Questao, servidos(): string[], total: number, origem: string }

  Garantias (história 5.3):
    - nunca serve o mesmo problema duas vezes;
    - nunca serve duas operações iguais seguidas, quando o acervo permite;
    - nunca serve dois enunciados/textos idênticos seguidos;
    - quando o acervo acaba, completa com o gerador local.

  Como: fila embaralhada por dificuldade + escolha do primeiro candidato
  que respeita o anterior, com relaxamento em cascata das restrições
  (operação -> enunciado -> primeiro da fila). É busca limitada, então
  proxima() SEMPRE termina — nada de sortear até dar certo.
*/
export function criarFonteDeProblemas(fase, problemas) {
  const acervo = [];
  const textos = new Set();

  for (const p of Array.isArray(problemas) ? problemas : []) {
    // aceita tanto Questao pronta quanto linha crua do banco
    const q = ehQuestao(p) ? p : normalizarProblema(p, fase);
    if (!q || textos.has(q.texto)) continue;
    textos.add(q.texto);
    acervo.push(q);
  }

  const fila = filaPorDificuldade(acervo);
  const idsServidos = [];
  let anterior = null;
  let gerados = 0;
  let usouLocal = acervo.some((q) => q.origem !== "supabase");
  const temSupabase = acervo.some((q) => q.origem === "supabase");
  let proximaLocal = null; // gerador criado só quando precisar

  /* Esta fase consegue alternar operações? Juntamos o que o acervo tem
     com o que o gerador local sabe fazer. Se só existe uma operação (a
     Fase 1 é só de somas), repetir "+" atrás de "+" é inevitável — e aí
     a regra de não repetir operação simplesmente não se aplica. */
  const operacoesPossiveis = new Set(acervo.map((q) => q.operacao));
  for (const op of configDoGerador(fase).operacoes || []) operacoesPossiveis.add(op);
  const podeAlternar = operacoesPossiveis.size > 1;

  function combina(q, checarOperacao) {
    if (anterior) {
      if (q.texto === anterior.texto) return false;
      if (q.enunciado && anterior.enunciado && q.enunciado === anterior.enunciado) return false;
      if (checarOperacao && q.operacao === anterior.operacao) return false;
    }
    return true;
  }

  /*
    Entre os candidatos válidos, escolhe o da operação que MAIS sobra na
    fila. Parece detalhe, mas é o que impede o beco sem saída: pegando
    sempre o primeiro candidato válido, a fila termina com duas contas da
    mesma operação e a última repetição fica inevitável. Servindo primeiro
    a operação mais numerosa, o que sobra continua equilibrado (é o mesmo
    guloso do problema clássico de reorganizar sem vizinhos iguais).
    Empate mantém o índice menor, então a curva de dificuldade sobrevive.
  */
  function escolherIndice() {
    const restam = new Map();
    for (const q of fila) restam.set(q.operacao, (restam.get(q.operacao) || 0) + 1);

    let melhor = -1;
    let maiorPeso = -1;
    for (let i = 0; i < fila.length; i++) {
      if (!combina(fila[i], true)) continue;
      const peso = restam.get(fila[i].operacao) || 0;
      if (peso > maiorPeso) { maiorPeso = peso; melhor = i; }
    }
    if (melhor >= 0) return melhor;             // ideal: trocou de operação

    /* Sobrou só a operação que acabou de sair. Se a fase sabe fazer
       outra, -1 manda a vez para o gerador local: a conta da fila não se
       perde, só entra na rodada seguinte. */
    if (podeAlternar) return -1;

    const i = fila.findIndex((q) => combina(q, false)); // fase de uma operação só
    if (i >= 0) return i;
    return 0;                                   // acervo minúsculo: serve o que tem
  }

  function doGerador() {
    if (!proximaLocal) proximaLocal = criarGeradorSeguro(fase);
    let reserva = null;
    for (let tent = 0; tent < 12; tent++) {
      const q = proximaLocal();
      if (textos.has(q.texto)) continue;        // não repete conta já servida
      if (!reserva) reserva = q;
      if (!anterior || q.operacao !== anterior.operacao) return q;
    }
    return reserva || questaoDeEmergencia(fase);
  }

  function proxima() {
    let q = null;
    if (fila.length) {
      const i = escolherIndice();
      if (i >= 0) q = fila.splice(i, 1)[0];
    }
    if (!q) { // fila vazia, ou a fila só repetiria a operação anterior
      q = doGerador();
      gerados++;
      usouLocal = true;
    }
    anterior = q;
    textos.add(q.texto);
    /* Só ids do banco entram em servidos(): eles viram p_excluir (uuid[])
       na próxima rodada e "local-7" quebraria o cast. */
    if (q.origem === "supabase" && q.id) idsServidos.push(q.id);
    return q;
  }

  return {
    proxima,
    servidos: () => idsServidos.slice(),
    get total() { return acervo.length + gerados; },
    get origem() {
      if (!temSupabase) return "local";
      return usouLocal ? "misto" : "supabase";
    },
  };
}

/* ===================================================================== */
/* 6) Memória da última rodada (localStorage, tolerante a falha)          */
/* ===================================================================== */

/* Em aba privada, com cookies bloqueados ou no Node (teste) não existe
   localStorage — nesses casos a criança só corre o risco de repetir
   problemas na rodada seguinte, o que é aceitável. */
function armazenamento() {
  try {
    if (typeof localStorage === "undefined" || !localStorage) return null;
    return localStorage;
  } catch {
    return null;
  }
}

/* Guarda os ids da rodada que acabou (substitui, não acumula: o contrato
   fala em "rodada anterior", e lembrar demais esvaziaria o acervo). */
export function lembrarServidos(faseId, ids) {
  const store = armazenamento();
  if (!store) return false;
  try {
    const lista = (Array.isArray(ids) ? ids : [])
      .map(comoTexto)
      .filter(Boolean)
      .slice(0, LIMITE_SERVIDOS);
    store.setItem(PREFIXO_SERVIDOS + comoInteiro(faseId, 0), JSON.stringify(lista));
    return true;
  } catch {
    return false; // quota cheia ou storage bloqueado: segue o jogo
  }
}

export function ultimosServidos(faseId) {
  const store = armazenamento();
  if (!store) return [];
  try {
    const cru = store.getItem(PREFIXO_SERVIDOS + comoInteiro(faseId, 0));
    const lista = JSON.parse(cru);
    if (!Array.isArray(lista)) return [];
    return lista.map(comoTexto).filter(Boolean).slice(0, LIMITE_SERVIDOS);
  } catch {
    return []; // JSON corrompido: começa do zero, sem drama
  }
}

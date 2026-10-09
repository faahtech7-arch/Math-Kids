/*
  =========================================================================
  Math Kids — Progresso, pontuação e recompensas: a ida ao banco
  =========================================================================
  Fonte de verdade: Supabase (RPC). Se o Supabase não responder — offline,
  schema ainda não instalado, sessão expirada — cai automaticamente para
  um espelho em localStorage, isolado por avatar. Assim a progressão de
  fases funciona de ponta a ponta mesmo sem backend: concluir a Fase 1
  com ≥ 1 estrela libera a Fase 2 ("Menos e menos"), que libera a Fase 3
  ("Vai e volta"), e assim por diante (regra em js/fases.js).

  Desde o Épico 4 este arquivo também grava e lê tempo, erros, medalha e
  conquistas (histórias 6.3 / 6.4 / 6.7):

    carregarProgresso(token)  -> { [fase]: { estrelas, melhor_pontos, ... } }
    registrarResultado(token, fase, partida, { fases })
         -> { partida, novasConquistas, offline, origem }
    carregarPainel(token)     -> { resumo, fases, conquistas, origem, erro }
    carregarConquistas(token) -> { conquistas, origem, erro }
    conquistasNaoVistas(lista) / marcarConquistasVistas(codigos)

  Aqui só mora a CONVERSA com o banco e com o localStorage. As regras
  (quanto vale um acerto, o que é "melhor", quem merece qual conquista)
  ficam em js/pontuacao.js e js/recompensas.js, que não dependem de rede.

  Três situações que este arquivo resolve sem a tela perceber:
    banco com o Épico 4   -> o servidor calcula tudo e guarda as conquistas;
    banco ainda antigo    -> grava pela RPC antiga (salvar_resultado_fase)
                             e as conquistas ficam neste dispositivo;
    sem banco nenhum      -> tudo neste dispositivo.
  Em nenhuma delas a criança fica presa esperando ou vê uma tela de erro.
  =========================================================================
*/
import { supabase } from "./supabaseClient.js";
import { obterSessao } from "./sessao.js";
import { listarFasesComStatus } from "./conteudo.js";
import { melhorDaFase, mesclarMapas, linhaDaPartida } from "./pontuacao.js";
import {
  CONQUISTAS_PADRAO,
  calcularMetricas,
  conquistasMerecidas,
  montarConquistas,
  montarPainelLocal,
  nivelDaRecompensa,
  normalizarConquistas,
  normalizarPainel,
  normalizarResultado,
} from "./recompensas.js";

const PREFIXO_LOCAL = "mathkids.progresso.";
const PREFIXO_CONQUISTAS = "mathkids.conquistas.";        // { codigo: dataISO } ganhas neste dispositivo
const PREFIXO_VISTAS = "mathkids.conquistasVistas.";      // [codigo] que a galeria já mostrou

/* ---- espelho local (localStorage), uma "gaveta" por avatar ---- */
function donoDaGaveta() {
  const s = obterSessao();
  return s?.avatar?.id || s?.token || "anon";
}

function chaveLocal() {
  return PREFIXO_LOCAL + donoDaGaveta();
}

function lerGaveta(chave, padrao) {
  try {
    const valor = JSON.parse(localStorage.getItem(chave));
    return valor && typeof valor === "object" ? valor : padrao;
  } catch {
    return padrao; // localStorage indisponível (aba privada, JSON corrompido) — segue em memória
  }
}

function gravarGaveta(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem localStorage (quota/aba privada): vale só enquanto a aba estiver aberta */
  }
}

function lerLocal() {
  const mapa = lerGaveta(chaveLocal(), {});
  return Array.isArray(mapa) ? {} : mapa;
}

function gravarLocal(mapa) {
  gravarGaveta(chaveLocal(), mapa);
}

function lerConquistasLocais() {
  const ganhas = lerGaveta(PREFIXO_CONQUISTAS + donoDaGaveta(), {});
  return Array.isArray(ganhas) ? {} : ganhas;
}

/* Soma conquistas à gaveta sem nunca tirar nenhuma: conquista é para
   sempre, e a data que vale é a primeira que ficou registrada. */
function guardarConquistas(novas) {
  const ganhas = lerConquistasLocais();
  let mudou = false;
  for (const [codigo, data] of Object.entries(novas || {})) {
    if (!codigo || ganhas[codigo]) continue;
    ganhas[codigo] = data || new Date().toISOString();
    mudou = true;
  }
  if (mudou) gravarGaveta(PREFIXO_CONQUISTAS + donoDaGaveta(), ganhas);
  return ganhas;
}

/* Esvazia as gavetas de um avatar neste dispositivo. Chamado quando o avatar
   é excluído (js/script.js): sem isto, a próxima criança que recebesse o
   mesmo avatar neste computador herdaria fases, medalhas e conquistas. */
export function esquecerAvatarLocal(avatarId) {
  if (!avatarId) return;
  try {
    for (const prefixo of [PREFIXO_LOCAL, PREFIXO_CONQUISTAS, PREFIXO_VISTAS]) {
      localStorage.removeItem(prefixo + avatarId);
    }
  } catch {
    /* sem localStorage não existe gaveta para esvaziar */
  }
}

/* ---- ponte com o Supabase: nunca lança, sempre { data, error } ---- */
async function rpc(nome, args) {
  try {
    const { data, error } = await supabase.rpc(nome, args || {});
    return { data: data ?? null, error: error || null };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

function mensagemDeErro(e) {
  if (!e) return null;
  return (typeof e.message === "string" && e.message) || String(e);
}

/* O banco responde, mas ainda não tem a função: é o schema antigo (o
   supabase/schema.sql novo ainda não foi rodado). PGRST202 é o código do
   PostgREST para "função não encontrada"; 42883 é o do Postgres. */
function funcaoInexistente(error) {
  if (!error) return false;
  const msg = String(error.message || "");
  return error.code === "PGRST202" || error.code === "42883" ||
    /could not find the function/i.test(msg);
}

export async function carregarProgresso(token) {
  const local = lerLocal();
  try {
    const { data, error } = await supabase.rpc("carregar_progresso", { p_token: token });
    if (error) throw error;
    const remoto = {};
    (data || []).forEach((r) => { remoto[r.fase] = r; });
    const mesclado = mesclarMapas(local, remoto); // remoto manda, mas não perde progresso feito offline
    gravarLocal(mesclado);
    return mesclado;
  } catch (e) {
    console.warn("Progresso: usando espelho local (Supabase indisponível).", e?.message || e);
    return local;
  }
}

/* ===================================================================== */
/* Gravar o resultado de uma fase (história 6.3)                          */
/* ===================================================================== */

/* Conquista do catálogo de reserva -> o mesmo formato que vem do banco. */
function conquistasDoCatalogo(codigos, metricas, quando) {
  const ganhas = Object.fromEntries(codigos.map((c) => [c, quando]));
  return montarConquistas(
    CONQUISTAS_PADRAO.filter((c) => codigos.includes(c.codigo)),
    metricas,
    ganhas
  );
}

/*
  registrarResultado(token, fase, partida, { fases })
    partida = o que js/partida.js mediu:
      { respostas, tempoGasto, pontos, acertos, erros, melhorCombo, estrelas, total }
    fases   = a trilha (listarFasesComStatus) — o motor de conquistas local
              precisa saber quais fases são extras ou cronometradas.

    -> { partida: { pontos, acertos, erros, total, tempoGasto, melhorCombo,
                    estrelas, nivel, recorde, primeiraConclusao, subiuDeMedalha },
         novasConquistas: [conquista],   // só as que a criança ainda não tinha visto ganhar
         offline: boolean, origem: "supabase" | "supabase-antigo" | "local" }

  Nunca lança e nunca trava o jogo: o pior caso é "salvo neste dispositivo".
*/
export async function registrarResultado(token, fase, partida, contexto) {
  fase = Number(fase);
  const agora = new Date().toISOString();

  // 1) grava SEMPRE no espelho local primeiro, mantendo o melhor desempenho
  const local = lerLocal();
  const antes = local[fase] || null;
  /* O que a criança já merecia ANTES desta partida não é novidade dela —
     sem isto, a primeira partida num dispositivo novo anunciaria de uma
     vez todas as conquistas antigas. */
  const jaMerecia = new Set(
    conquistasMerecidas(CONQUISTAS_PADRAO, calcularMetricas(local, contexto?.fases))
  );
  local[fase] = melhorDaFase(antes, linhaDaPartida(fase, partida, antes?.tentativas, agora));
  gravarLocal(local);

  /* O que esta partida mudou, visto daqui. Se o servidor responder, a
     versão dele substitui esta — é ele quem faz a conta que vale. */
  const partidaLocal = {
    pontos: Math.round(partida.pontos),
    acertos: partida.acertos,
    erros: partida.erros,
    total: partida.total,
    tempoGasto: partida.tempoGasto,
    melhorCombo: partida.melhorCombo,
    estrelas: partida.estrelas,
    nivel: nivelDaRecompensa(partida.estrelas),
    recorde: Math.round(partida.pontos) > (antes?.melhor_pontos || 0),
    primeiraConclusao: partida.estrelas >= 1 && !antes?.concluida,
    subiuDeMedalha: partida.estrelas > (antes?.estrelas || 0),
  };

  // conquistas pelo motor local (vale quando o banco não cuida disso)
  const jaTinha = lerConquistasLocais();
  const metricas = calcularMetricas(local, contexto?.fases);
  const merecidas = conquistasMerecidas(CONQUISTAS_PADRAO, metricas);
  const novasLocais = merecidas.filter((c) => !jaTinha[c] && !jaMerecia.has(c));
  const todasMerecidas = Object.fromEntries(merecidas.map((c) => [c, agora]));

  // 2) tenta o servidor: é ele quem calcula pontos, estrelas, medalha e conquistas
  const r = await rpc("registrar_resultado_fase", {
    p_token: token,
    p_fase_id: fase,
    p_respostas: partida.respostas,
    p_tempo_gasto: Number.isFinite(partida.tempoGasto) ? Math.round(partida.tempoGasto) : null,
  });

  const doServidor = r.error ? null : normalizarResultado(r.data);
  if (doServidor) {
    if (doServidor.partida.pontos !== partidaLocal.pontos) {
      // não deveria acontecer: js/pontuacao.js e o schema.sql saíram de sincronia
      console.warn("Pontuação: o servidor calculou", doServidor.partida.pontos,
        "e a tela mostrou", partidaLocal.pontos);
    }
    local[fase] = melhorDaFase(local[fase], { ...doServidor.progresso, fase });
    gravarLocal(local);

    /* Só anuncia o que é novidade para ESTE dispositivo também — conquista
       ganha offline ontem não merece fanfarra de novo hoje. */
    const anunciar = doServidor.novasConquistas.filter((c) => !jaTinha[c.codigo]);
    guardarConquistas({
      ...todasMerecidas,
      ...Object.fromEntries(doServidor.novasConquistas.map((c) => [c.codigo, c.data_desbloqueio])),
    });
    return { partida: doServidor.partida, novasConquistas: anunciar, offline: false, origem: "supabase" };
  }

  const novasConquistas = conquistasDoCatalogo(novasLocais, metricas, agora);
  guardarConquistas(todasMerecidas);

  // 3) banco ainda no schema antigo: grava pela RPC de antes do Épico 4
  if (funcaoInexistente(r.error)) {
    const antigo = await rpc("salvar_resultado_fase", {
      p_token: token,
      p_fase: fase,
      p_pontos: partidaLocal.pontos,
      p_estrelas: partida.estrelas,
      p_acertos: partida.acertos,
      p_total: partida.total,
    });
    if (!antigo.error) {
      return { partida: partidaLocal, novasConquistas, offline: false, origem: "supabase-antigo" };
    }
    console.warn("Progresso: salvo só neste dispositivo (Supabase indisponível).", mensagemDeErro(antigo.error));
    return { partida: partidaLocal, novasConquistas, offline: true, origem: "local", erro: mensagemDeErro(antigo.error) };
  }

  console.warn("Progresso: salvo só neste dispositivo (Supabase indisponível).", mensagemDeErro(r.error));
  return { partida: partidaLocal, novasConquistas, offline: true, origem: "local", erro: mensagemDeErro(r.error) };
}

/* ===================================================================== */
/* Ler o painel e a galeria (histórias 6.4 / 6.5 / 6.7)                   */
/* ===================================================================== */

/* Guarda neste dispositivo o que o banco diz que já foi desbloqueado, para
   a galeria continuar igual se a rede cair depois. */
function espelharConquistas(conquistas) {
  guardarConquistas(Object.fromEntries(
    conquistas.filter((c) => c.desbloqueada).map((c) => [c.codigo, c.data_desbloqueio])
  ));
}

/* Plano B: o mesmo painel, montado com a trilha do menu + o espelho local
   + o catálogo de reserva. Quem já tinha progresso ganha na hora as
   conquistas que merece — igual à migração faz no banco. */
async function painelLocal(token) {
  const [listagem, progresso] = await Promise.all([
    listarFasesComStatus(token),
    carregarProgresso(token),
  ]);
  const painel = montarPainelLocal({
    fases: listagem.fases,
    progresso,
    desbloqueadas: lerConquistasLocais(),
  });
  guardarConquistas(Object.fromEntries(
    painel.conquistas.filter((c) => c.desbloqueada).map((c) => [c.codigo, c.data_desbloqueio])
  ));
  return {
    resumo: painel.resumo,
    fases: painel.fases,
    conquistas: painel.conquistas,
    origem: "local",
    erro: listagem.erro || null,
  };
}

/*
  carregarPainel(token) -> { resumo, fases, conquistas, origem, erro }

  Uma chamada só (painel_progresso) traz fases, pontuação e recompensas.
  `erro` com "Sessão" é o único que a tela precisa tratar: manda a criança
  fazer login de novo. Qualquer outra falha já virou painel local aqui.
*/
export async function carregarPainel(token) {
  const r = await rpc("painel_progresso", { p_token: token });
  const painel = r.error ? null : normalizarPainel(r.data);
  if (painel) {
    espelharConquistas(painel.conquistas);
    return { ...painel, origem: "supabase", erro: null };
  }
  const local = await painelLocal(token);
  return { ...local, erro: local.erro || mensagemDeErro(r.error) };
}

/* carregarConquistas(token) -> { conquistas, origem, erro }
   A galeria só precisa das conquistas: usa a RPC própria (listar_conquistas),
   que é mais leve que o painel inteiro. */
export async function carregarConquistas(token) {
  const r = await rpc("listar_conquistas", { p_token: token });
  if (!r.error && Array.isArray(r.data)) {
    const conquistas = normalizarConquistas(r.data);
    espelharConquistas(conquistas);
    return { conquistas, origem: "supabase", erro: null };
  }
  const local = await painelLocal(token);
  return { conquistas: local.conquistas, origem: "local", erro: local.erro || mensagemDeErro(r.error) };
}

/* ---- "NOVA!" na galeria: o que foi ganho e a criança ainda não viu ----
   Fica só neste dispositivo; se o localStorage sumir, o pior que acontece é
   o selinho aparecer de novo. */
function lerVistas() {
  const vistas = lerGaveta(PREFIXO_VISTAS + donoDaGaveta(), []);
  return Array.isArray(vistas) ? vistas : [];
}

export function conquistasNaoVistas(conquistas) {
  const vistas = new Set(lerVistas());
  return (Array.isArray(conquistas) ? conquistas : [])
    .filter((c) => c.desbloqueada && !vistas.has(c.codigo))
    .map((c) => c.codigo);
}

export function marcarConquistasVistas(codigos) {
  const vistas = new Set(lerVistas());
  for (const c of Array.isArray(codigos) ? codigos : []) if (c) vistas.add(c);
  gravarGaveta(PREFIXO_VISTAS + donoDaGaveta(), [...vistas]);
}

/*
  =========================================================================
  Math Kids — Progressão e pontuação
  =========================================================================
  Fonte de verdade: Supabase (RPC). Se o Supabase não responder — offline,
  schema ainda não instalado, sessão expirada — cai automaticamente para
  um espelho em localStorage, isolado por avatar. Assim a progressão de
  fases funciona de ponta a ponta mesmo sem backend: concluir a Fase 1
  com ≥ 1 estrela libera a Fase 2 ("Menos e menos"), que libera a Fase 3
  ("Vai e volta"), e assim por diante (regra em js/fases.js).

  carregarProgresso(token) -> { [fase]: { estrelas, melhor_pontos, ... } }
  salvarResultado(token, fase, { pontos, estrelas, acertos, total })
       -> { fase, estrelas, melhor_pontos, concluida, offline }
  =========================================================================
*/
import { supabase } from "./supabaseClient.js";
import { obterSessao } from "./sessao.js";

const PREFIXO_LOCAL = "mathkids.progresso.";

/* ---- espelho local (localStorage), uma "gaveta" por avatar ---- */
function chaveLocal() {
  const s = obterSessao();
  return PREFIXO_LOCAL + (s?.avatar?.id || s?.token || "anon");
}

function lerLocal() {
  try {
    return JSON.parse(localStorage.getItem(chaveLocal())) || {};
  } catch {
    return {}; // localStorage indisponível (aba privada, JSON corrompido) — segue em memória
  }
}

function gravarLocal(mapa) {
  try {
    localStorage.setItem(chaveLocal(), JSON.stringify(mapa));
  } catch {
    /* sem localStorage (quota/aba privada): o progresso vale só enquanto a aba estiver aberta */
  }
}

/* Mescla duas linhas da MESMA fase mantendo o melhor de cada campo —
   mesma regra do greatest(...) no on conflict de supabase/schema.sql. */
function melhorDaFase(a, b) {
  a = a || {};
  b = b || {};
  const estrelas = Math.max(a.estrelas || 0, b.estrelas || 0);
  return {
    fase: Number(a.fase ?? b.fase),
    estrelas,
    melhor_pontos: Math.max(a.melhor_pontos || 0, b.melhor_pontos || 0),
    melhor_acertos: Math.max(a.melhor_acertos || 0, b.melhor_acertos || 0),
    total_questoes: b.total_questoes ?? a.total_questoes ?? 0,
    concluida: !!(a.concluida || b.concluida || estrelas >= 1),
    tentativas: Math.max(a.tentativas || 0, b.tentativas || 0),
    atualizado_em: b.atualizado_em || a.atualizado_em || null,
  };
}

function mesclarMapas(base, extra) {
  const out = { ...base };
  for (const fase of Object.keys(extra || {})) {
    out[fase] = melhorDaFase(out[fase], extra[fase]);
  }
  return out;
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

export async function salvarResultado(token, fase, { pontos, estrelas, acertos, total }) {
  fase = Number(fase);

  // 1) grava SEMPRE no espelho local primeiro, mantendo o melhor desempenho
  const local = lerLocal();
  const linhaLocal = melhorDaFase(local[fase], {
    fase,
    estrelas,
    melhor_pontos: Math.round(pontos),
    melhor_acertos: acertos,
    total_questoes: total,
    concluida: estrelas >= 1,
    tentativas: (local[fase]?.tentativas || 0) + 1,
    atualizado_em: new Date().toISOString(),
  });
  local[fase] = linhaLocal;
  gravarLocal(local);

  // 2) tenta sincronizar com o Supabase (fonte de verdade quando disponível)
  try {
    const { data, error } = await supabase.rpc("salvar_resultado_fase", {
      p_token: token,
      p_fase: fase,
      p_pontos: Math.round(pontos),
      p_estrelas: estrelas,
      p_acertos: acertos,
      p_total: total,
    });
    if (error) throw error;
    const linha = (data && data[0]) || linhaLocal;
    return { ...linha, offline: false };
  } catch (e) {
    console.warn("Progresso: salvo só neste dispositivo (Supabase indisponível).", e?.message || e);
    return {
      fase: linhaLocal.fase,
      estrelas: linhaLocal.estrelas,
      melhor_pontos: linhaLocal.melhor_pontos,
      concluida: linhaLocal.concluida,
      offline: true,
    };
  }
}

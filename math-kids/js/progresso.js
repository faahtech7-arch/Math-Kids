/*
  =========================================================================
  Math Kids — Progressão e pontuação (via Supabase RPC)
  =========================================================================
  carregarProgresso(token) -> { [fase]: { estrelas, melhor_pontos, ... } }
  salvarResultado(token, fase, { pontos, estrelas, acertos, total })
  =========================================================================
*/
import { supabase } from "./supabaseClient.js";

export async function carregarProgresso(token) {
  const { data, error } = await supabase.rpc("carregar_progresso", { p_token: token });
  if (error) throw error;
  const mapa = {};
  (data || []).forEach((r) => { mapa[r.fase] = r; });
  return mapa;
}

export async function salvarResultado(token, fase, { pontos, estrelas, acertos, total }) {
  const { data, error } = await supabase.rpc("salvar_resultado_fase", {
    p_token: token,
    p_fase: fase,
    p_pontos: Math.round(pontos),
    p_estrelas: estrelas,
    p_acertos: acertos,
    p_total: total,
  });
  if (error) throw error;
  return (data && data[0]) || null;
}

/*
  =========================================================================
  Math Kids — Sessão da criança (entre as telas do jogo)
  =========================================================================
  Guarda no sessionStorage o token devolvido por `iniciar_sessao` e os
  dados do avatar pré-definido escolhido. Sem dado pessoal da criança.

  Formato:
    { token: "…", avatar: { id, nome, tipo, cor, accent } }
  =========================================================================
*/
import { supabase } from "./supabaseClient.js";

const CHAVE = "mathkids.sessao";

export function salvarSessao(sessao) {
  sessionStorage.setItem(CHAVE, JSON.stringify(sessao));
}

export function obterSessao() {
  try {
    const s = JSON.parse(sessionStorage.getItem(CHAVE));
    return s && s.token ? s : null;
  } catch {
    return null;
  }
}

export async function limparSessao() {
  const s = obterSessao();
  sessionStorage.removeItem(CHAVE);
  if (s?.token) {
    try { await supabase.rpc("encerrar_sessao", { p_token: s.token }); } catch { /* ok */ }
  }
}

/* Usar no topo das telas do jogo: sem sessão válida, volta pro login. */
export function exigirSessao() {
  const s = obterSessao();
  if (!s) {
    location.replace("index.html");
    throw new Error("Sessão ausente — redirecionando para o login.");
  }
  return s;
}

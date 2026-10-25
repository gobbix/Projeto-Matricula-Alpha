import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cliente: SupabaseClient | null = null;

// Cliente com a chave pública (anon). O associado não faz login:
// ele só lê o catálogo e chama as funções inscrever / consultar_inscricao.
export function supabase(): SupabaseClient {
  if (!cliente) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !chave) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (veja .env.example).");
    cliente = createClient(url, chave, { auth: { persistSession: false } });
  }
  return cliente;
}

// Mensagem de erro amigável a partir do retorno do Supabase (as funções do banco já respondem em português)
export function mensagemErro(e: unknown): string {
  const m = (e as { message?: string })?.message || "";
  if (/fetch|network|Failed to fetch/i.test(m)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  return m || "Não foi possível concluir agora. Tente novamente em instantes.";
}

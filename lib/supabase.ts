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

// Cliente do navegador com sessão guardada (painel da equipe e atendimento no balcão)
let clienteSessao: SupabaseClient | null = null;
export function supabaseNavegador(): SupabaseClient {
  if (!clienteSessao) {
    clienteSessao = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "alphaville-painel" },
    });
  }
  return clienteSessao;
}

// Mensagem de erro amigável a partir do retorno do Supabase (as funções do banco já respondem em português)
export function mensagemErro(e: unknown): string {
  const m = (e as { message?: string })?.message || "";
  if (/fetch|network|Failed to fetch/i.test(m)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/User already registered/i.test(m)) return "Já existe uma conta com este e-mail. Use Entrar.";
  if (/Password should be/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  if (/row-level security|permission denied/i.test(m)) return "Você não tem permissão para esta ação.";
  return m || "Não foi possível concluir agora. Tente novamente em instantes.";
}

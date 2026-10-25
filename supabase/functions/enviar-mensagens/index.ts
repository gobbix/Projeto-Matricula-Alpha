// Envia por e-mail as mensagens da tabela "mensagens" (chamamento, desligamento, comprovante).
//
// Acionamento:
//  - Database Webhook do Supabase em INSERT na tabela public.mensagens (envio imediato);
//  - e/ou um agendamento (pg_cron) chamando esta função sem corpo, que reprocessa as pendentes.
//
// Segredos (supabase secrets set ...):
//  RESEND_API_KEY   chave do serviço de e-mail Resend (https://resend.com)
//  EMAIL_REMETENTE  ex.: "Alphaville Clube <atividades@alphavilleclube.com.br>" (domínio verificado no Resend)
//  WEBHOOK_SECRET   texto secreto enviado no cabeçalho x-webhook-secret pelo webhook/agendamento
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já existem no ambiente das Edge Functions.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_TENTATIVAS = 3;

type Mensagem = {
  id: string;
  email: string;
  assunto: string;
  texto: string;
  status: string;
  tentativas: number;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function html(texto: string): string {
  const esc = texto.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#13201f;max-width:560px">
    ${esc.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}
    <p style="color:#5a6a69;font-size:12px">Mensagem automática do sistema de matrículas do Alphaville Clube.</p></div>`;
}

async function enviar(m: Mensagem): Promise<void> {
  if (m.status !== "pendente") return;
  if (!m.email) {
    await supabase.from("mensagens").update({ status: "erro", erro: "Titular sem e-mail cadastrado." }).eq("id", m.id);
    return;
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("EMAIL_REMETENTE"),
      to: [m.email],
      subject: m.assunto || "Alphaville Clube — atividades esportivas",
      text: m.texto,
      html: html(m.texto),
    }),
  });
  if (resp.ok) {
    await supabase.from("mensagens")
      .update({ status: "enviada", enviada_em: new Date().toISOString(), erro: null })
      .eq("id", m.id).eq("status", "pendente");
    return;
  }
  const tentativas = (m.tentativas ?? 0) + 1;
  await supabase.from("mensagens").update({
    tentativas,
    erro: `Falha no envio (${resp.status}): ${(await resp.text()).slice(0, 300)}`,
    status: tentativas >= MAX_TENTATIVAS ? "erro" : "pendente",
  }).eq("id", m.id);
}

Deno.serve(async (req) => {
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("WEBHOOK_SECRET")) {
    return new Response("Não autorizado", { status: 401 });
  }
  const corpo = await req.json().catch(() => null);

  // Webhook de INSERT: envia só a mensagem recém-criada
  if (corpo?.type === "INSERT" && corpo?.record?.id) {
    await enviar(corpo.record as Mensagem);
    return Response.json({ processadas: 1 });
  }

  // Agendamento: reprocessa as pendentes (mais antigas primeiro)
  const { data, error } = await supabase.from("mensagens")
    .select("id,email,assunto,texto,status,tentativas")
    .eq("status", "pendente").lt("tentativas", MAX_TENTATIVAS)
    .order("criado_em").limit(50);
  if (error) return Response.json({ erro: error.message }, { status: 500 });
  for (const m of data ?? []) await enviar(m as Mensagem);
  return Response.json({ processadas: data?.length ?? 0 });
});

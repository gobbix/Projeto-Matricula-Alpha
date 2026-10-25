"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dataHora } from "@/lib/painel";

export type Mensagem = {
  id: string; tipo: "chamamento" | "desligamento" | "comprovante"; titular_nome: string; telefone: string; email: string;
  assunto: string; texto: string; motivo: string; status: "pendente" | "enviada" | "erro"; erro: string | null;
  criado_em: string; enviada_em: string | null; enviada_por: string | null;
};

const fone = (t: string) => (t.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : t.length === 10 ? `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}` : t);

// Mensagens aos titulares. O e-mail sai automaticamente (Edge Function); o WhatsApp é enviado por uma pessoa.
export function CartaoMensagem({ m, cliente, usuarioId, onMudou }: { m: Mensagem; cliente: SupabaseClient; usuarioId: string; onMudou: () => void }) {
  const [copiado, setCopiado] = useState(false);
  async function marcar() {
    await cliente.from("mensagens").update({ status: "enviada", enviada_em: new Date().toISOString(), enviada_por: usuarioId }).eq("id", m.id);
    onMudou();
  }
  return (
    <div className="caixa">
      <div className="caixa-cab">
        <span><b>Para {m.titular_nome}</b> <span className="hint">· {fone(m.telefone)}{m.email ? ` · ${m.email}` : ""}</span></span>
        {m.status === "enviada" ? <span className="chip ok">{m.enviada_por ? "Enviada" : "E-mail enviado"} {dataHora(m.enviada_em)}</span>
          : m.status === "erro" ? <span className="chip bad">Falha no e-mail</span> : <span className="chip warn">Aguardando envio</span>}
      </div>
      <div className="hint">
        <span className={`chip ${m.tipo === "desligamento" ? "bad" : "ok"}`}>{m.tipo === "desligamento" ? "Desligamento" : "Chamamento"}</span>{" "}
        {m.motivo && `vaga aberta por ${m.motivo} · `}{dataHora(m.criado_em)}
        {m.erro && <> · {m.erro}</>}
      </div>
      <textarea className="field" rows={4} readOnly value={m.texto} aria-label="Texto da mensagem" />
      <div className="toolbar">
        {m.telefone && <a className="btn small" href={`https://wa.me/55${m.telefone}?text=${encodeURIComponent(m.texto)}`} target="_blank" rel="noopener noreferrer">Abrir no WhatsApp</a>}
        <button type="button" className="btn small" onClick={async () => { try { await navigator.clipboard.writeText(m.texto); setCopiado(true); } catch { /* texto continua selecionável */ } }}>
          {copiado ? "Texto copiado" : "Copiar texto"}
        </button>
        {m.status !== "enviada" && <button type="button" className="btn small primary" onClick={marcar}>Marcar como enviada</button>}
      </div>
    </div>
  );
}

export default function Mensagens({ mensagens, cliente, usuarioId, onMudou }: { mensagens: Mensagem[]; cliente: SupabaseClient; usuarioId: string; onMudou: () => void }) {
  const [verEnviadas, setVerEnviadas] = useState(false);
  const pendentes = mensagens.filter((m) => m.status !== "enviada");
  const enviadas = mensagens.filter((m) => m.status === "enviada");
  if (!mensagens.length) return null;
  return (
    <div className="card">
      <h2>Mensagens aos titulares</h2>
      <p className="hint" style={{ margin: 0 }}>
        {pendentes.length ? `${pendentes.length} ${pendentes.length === 1 ? "mensagem aguardando envio" : "mensagens aguardando envio"}` : "Nenhuma mensagem aguardando envio"}
        {enviadas.length ? ` · ${enviadas.length} já ${enviadas.length === 1 ? "enviada" : "enviadas"}` : ""}.
      </p>
      {pendentes.map((m) => <CartaoMensagem key={m.id} m={m} cliente={cliente} usuarioId={usuarioId} onMudou={onMudou} />)}
      {enviadas.length > 0 && (
        <div><button type="button" className="btn small" onClick={() => setVerEnviadas(!verEnviadas)}>{verEnviadas ? "Ocultar enviadas" : "Ver enviadas"}</button></div>
      )}
      {verEnviadas && enviadas.map((m) => <CartaoMensagem key={m.id} m={m} cliente={cliente} usuarioId={usuarioId} onMudou={onMudou} />)}
    </div>
  );
}

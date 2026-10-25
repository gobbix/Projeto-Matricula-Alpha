"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { mensagemErro } from "@/lib/supabase";

type Pedido = { nome: string; perfil_id: string; professor_nome: string; pedido_em: string };
type Perfil = { id: string; nome: string; ordem: number };

// Tela de quem tem conta mas ainda não faz parte da equipe
export default function PedidoAcesso({ cliente, usuario }: { cliente: SupabaseClient; usuario: User }) {
  const [pedido, setPedido] = useState<Pedido | null | undefined>(undefined);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [nome, setNome] = useState("");
  const [perfil, setPerfil] = useState("professor");
  const [professor, setProfessor] = useState("");
  const [erro, setErro] = useState("");

  async function carregar() {
    const [p, pf] = await Promise.all([
      cliente.from("pedidos_acesso").select("nome, perfil_id, professor_nome, pedido_em").eq("user_id", usuario.id).maybeSingle(),
      cliente.from("perfis").select("id, nome, ordem").order("ordem"),
    ]);
    setPedido((p.data as Pedido) ?? null);
    setPerfis((pf.data as Perfil[]) ?? []);
  }
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (nome.trim().split(/\s+/).length < 2) return setErro("Informe seu nome completo.");
    const { error } = await cliente.from("pedidos_acesso").insert({ nome: nome.trim(), perfil_id: perfil, professor_nome: professor.trim() });
    if (error) return setErro(mensagemErro(error));
    carregar();
  }
  async function cancelar() {
    await cliente.from("pedidos_acesso").delete().eq("user_id", usuario.id);
    carregar();
  }

  if (pedido === undefined) return <div className="empty">Carregando…</div>;
  if (pedido) {
    return (
      <div className="card estreito">
        <h2>Pedido de acesso enviado</h2>
        <p style={{ margin: 0 }}>
          Você pediu acesso como <b>{perfis.find((p) => p.id === pedido.perfil_id)?.nome ?? pedido.perfil_id}</b> em{" "}
          {new Date(pedido.pedido_em).toLocaleString("pt-BR")}. Quando a coordenação aprovar, as seções do painel aparecem aqui.
        </p>
        <div className="toolbar">
          <button type="button" className="btn" onClick={() => window.location.reload()}>Verificar de novo</button>
          <button type="button" className="btn small" onClick={cancelar}>Cancelar pedido</button>
        </div>
      </div>
    );
  }
  return (
    <form className="card estreito" onSubmit={enviar} noValidate>
      <h2>Solicitar acesso da equipe</h2>
      <p className="hint" style={{ margin: 0 }}>Conta: {usuario.email}. O pedido vai para a coordenação, que define o seu perfil.</p>
      <label className="f">Seu nome completo<input className="field" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" /></label>
      <label className="f">Função no clube
        <select className="field" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
          {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </label>
      <label className="f">Se for professor: seu nome como aparece no cronograma
        <input className="field" value={professor} onChange={(e) => setProfessor(e.target.value)} placeholder="Ex.: Vinicius" />
      </label>
      {erro && <div className="issue bad" role="alert">{erro}</div>}
      <div className="foot"><span /><button type="submit" className="btn primary">Enviar pedido</button></div>
    </form>
  );
}

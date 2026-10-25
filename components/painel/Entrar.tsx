"use client";

import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mensagemErro } from "@/lib/supabase";

export default function Entrar({ cliente }: { cliente: SupabaseClient }) {
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setAviso("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErro("Informe um e-mail válido.");
    if (senha.length < 6) return setErro("A senha precisa ter pelo menos 6 caracteres.");
    setOcupado(true);
    const r = modo === "entrar"
      ? await cliente.auth.signInWithPassword({ email: email.trim(), password: senha })
      : await cliente.auth.signUp({ email: email.trim(), password: senha });
    setOcupado(false);
    if (r.error) return setErro(mensagemErro(r.error));
    if (modo === "criar" && !r.data.session) setAviso("Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre aqui.");
  }

  return (
    <form className="card estreito" onSubmit={enviar} noValidate>
      <div>
        <div className="eyebrow">Painel da equipe</div>
        <h2>{modo === "entrar" ? "Entrar" : "Criar conta da equipe"}</h2>
      </div>
      <p className="hint" style={{ margin: 0 }}>
        {modo === "entrar"
          ? "Acesso para coordenação, secretaria e professores. Associados fazem a inscrição pela página inicial, sem login."
          : "Depois de criar a conta, você pede acesso e a coordenação define o seu perfil."}
      </p>
      <label className="f">E-mail<input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
      <label className="f">Senha
        <input className="field" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={modo === "entrar" ? "current-password" : "new-password"} />
      </label>
      {erro && <div className="issue bad" role="alert">{erro}</div>}
      {aviso && <div className="issue ok">{aviso}</div>}
      <div className="foot">
        <button type="button" className="btn" onClick={() => { setModo(modo === "entrar" ? "criar" : "entrar"); setErro(""); }}>
          {modo === "entrar" ? "Criar conta" : "Já tenho conta"}
        </button>
        <button type="submit" className="btn primary" disabled={ocupado}>{ocupado ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}</button>
      </div>
    </form>
  );
}

"use client";

import { normQL, type Titular } from "@/lib/regras";
import { ListaErros } from "./Inscricao";

type Props = { titular: Titular; onChange: (t: Titular) => void; erros: string[]; onAvancar: () => void };

export default function PassoTitular({ titular, onChange, erros, onAvancar }: Props) {
  const set = (k: keyof Titular) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...titular, [k]: e.target.value });
  const q = normQL(titular.quadra), l = normQL(titular.lote);
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); onAvancar(); }} noValidate>
      <h2>Dados do associado titular</h2>
      <label className="f">Nome completo do titular
        <input className="field" id="tit-nome" value={titular.nome} onChange={set("nome")} autoComplete="name" />
      </label>
      <div className="grid2">
        <label className="f">Quadra<input className="field" id="tit-quadra" value={titular.quadra} onChange={set("quadra")} placeholder="Ex.: 3" /></label>
        <label className="f">Lote<input className="field" id="tit-lote" value={titular.lote} onChange={set("lote")} placeholder="Ex.: 12" /></label>
      </div>
      {q && l && <div className="qlbox"><span>Confira:</span><span className="num">Quadra {q} · Lote {l}</span></div>}
      <div className="grid2">
        <label className="f">Celular (WhatsApp)
          <input className="field" id="tit-tel" value={titular.telefone} onChange={set("telefone")} inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" />
        </label>
        <label className="f">E-mail
          <input className="field" id="tit-email" value={titular.email} onChange={set("email")} inputMode="email" autoComplete="email" placeholder="nome@email.com" />
        </label>
      </div>
      <p className="hint" style={{ margin: 0 }}>O comprovante e os avisos sobre vagas serão enviados para este e-mail.</p>
      <ListaErros erros={erros} />
      <div className="foot"><span /><button type="submit" className="btn primary">Continuar</button></div>
    </form>
  );
}

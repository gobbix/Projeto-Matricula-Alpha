"use client";

import { idade, mascaraData, parseNasc, PARENTESCOS, type Participante } from "@/lib/regras";
import { ListaErros } from "./Inscricao";

type Props = {
  participantes: Participante[];
  onChange: (ps: Participante[]) => void;
  novoId: () => string;
  titularNome: string;
  maxMatriculas: number;
  erros: string[];
  onVoltar: () => void;
  onAvancar: () => void;
};

export default function PassoParticipantes({ participantes, onChange, novoId, titularNome, maxMatriculas, erros, onVoltar, onAvancar }: Props) {
  const temTitular = participantes.some((p) => p.tipo === "titular");
  const atualizar = (id: string, campos: Partial<Participante>) =>
    onChange(participantes.map((p) => (p.id === id ? { ...p, ...campos } : p)));
  const adicionar = (tipo: Participante["tipo"]) =>
    onChange([...participantes, { id: novoId(), tipo, nome: tipo === "titular" ? titularNome : "", nascTxt: "", parentesco: "" }]);

  return (
    <div className="card">
      <h2>Quem vai fazer as atividades?</h2>
      <p className="hint" style={{ margin: 0 }}>
        Cada pessoa pode ter até {maxMatriculas} matrículas confirmadas e quantas listas de espera quiser.
        A idade é conferida hoje, na data da inscrição.
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {participantes.length === 0 && <div className="empty" style={{ padding: 16 }}>Ninguém adicionado ainda.</div>}
        {participantes.map((p) => {
          const a = idade(parseNasc(p.nascTxt));
          return (
            <div className="person" key={p.id}>
              <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                <div className="quem">
                  {p.tipo === "titular" ? "Titular" : "Dependente"}
                  {a != null && a >= 0 && <span className="chip acc">{a} anos</span>}
                </div>
                <div className="grid3">
                  <label className="f">Nome completo
                    <input className="field" value={p.nome} readOnly={p.tipo === "titular"}
                      onChange={(e) => atualizar(p.id, { nome: e.target.value })} />
                  </label>
                  <label className="f">Nascimento
                    <input className="field" value={p.nascTxt} inputMode="numeric" placeholder="DD/MM/AAAA" maxLength={10} autoComplete="bday"
                      onChange={(e) => atualizar(p.id, { nascTxt: mascaraData(e.target.value) })} />
                  </label>
                  {p.tipo === "dependente" ? (
                    <label className="f">Parentesco
                      <select className="field" value={p.parentesco} onChange={(e) => atualizar(p.id, { parentesco: e.target.value })}>
                        <option value="">Selecione</option>
                        {PARENTESCOS.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    </label>
                  ) : <span />}
                </div>
              </div>
              <button type="button" className="btn small" onClick={() => onChange(participantes.filter((x) => x.id !== p.id))}>Remover</button>
            </div>
          );
        })}
      </div>
      <div className="toolbar">
        {!temTitular && <button type="button" className="btn" onClick={() => adicionar("titular")}>+ Eu, o titular</button>}
        <button type="button" className="btn" onClick={() => adicionar("dependente")}>+ Dependente</button>
      </div>
      <ListaErros erros={erros} />
      <div className="foot">
        <button type="button" className="btn" onClick={onVoltar}>Voltar</button>
        <button type="button" className="btn primary" onClick={onAvancar}>Escolher atividades</button>
      </div>
    </div>
  );
}

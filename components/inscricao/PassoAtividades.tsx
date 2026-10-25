"use client";

import { useState } from "react";
import {
  DIAS, estadoOpcao, faixaTxt, hhmm, idade, idadeOk, ordenarTurmas, parseNasc, previsao,
  type InscricaoExistente, type Participante, type Turma,
} from "@/lib/regras";
import { ListaErros } from "./Inscricao";

type Props = {
  participantes: Participante[];
  turmas: Turma[] | null;
  existentes: Record<string, InscricaoExistente[]>;
  selecao: Record<string, string[]>;
  onSelecao: (participanteId: string, lista: string[]) => void;
  maxMatriculas: number;
  erros: string[];
  onVoltar: () => void;
  onAvancar: () => void;
};

export default function PassoAtividades({ participantes, turmas, existentes, selecao, onSelecao, maxMatriculas, erros, onVoltar, onAvancar }: Props) {
  const [atual, setAtual] = useState(participantes[0]?.id);
  const [filtro, setFiltro] = useState("");
  const p = participantes.find((x) => x.id === atual) ?? participantes[0];
  if (!turmas) return <div className="empty">Carregando turmas…</div>;

  const a = idade(parseNasc(p.nascTxt));
  const primeiro = p.nome.split(" ")[0];
  const porId = (id: string) => turmas.find((t) => t.id === id);
  const escolhidas = (selecao[p.id] || []).map(porId).filter((t): t is Turma => !!t);
  const ja = (existentes[p.id] || []).map((x) => ({ ...x, turma: porId(x.turma_id) }));
  const permitidas = turmas.filter((t) => idadeOk(t, a)).sort(ordenarTurmas);
  const grupos = permitidas.reduce<Record<string, Turma[]>>((g, t) => ((g[t.modalidade] ??= []).push(t), g), {});
  const pv = previsao(escolhidas, existentes[p.id] || [], maxMatriculas);

  const alternar = (id: string) => {
    const lista = selecao[p.id] || [];
    onSelecao(p.id, lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);
  };

  return (
    <div className="card">
      <h2>Escolha as atividades</h2>
      {participantes.length > 1 && (
        <div className="ptabs" role="group" aria-label="Participante">
          {participantes.map((x) => (
            <button key={x.id} type="button" aria-pressed={x.id === p.id} onClick={() => { setAtual(x.id); setFiltro(""); }}>
              {x.nome.split(" ")[0]} · {(selecao[x.id] || []).length}
            </button>
          ))}
        </div>
      )}
      <p className="hint" style={{ margin: 0 }}>Aparecem somente as turmas permitidas para a idade de {primeiro} hoje ({a} anos).</p>
      <div className="meter">
        <b>{p.nome}</b>
        <span className={`chip ${pv.conf >= maxMatriculas ? "ok" : ""}`}>Matrículas previstas: {pv.conf} de {maxMatriculas}</span>
        <span className={`chip ${pv.esp ? "warn" : ""}`}>Listas de espera: {pv.esp}</span>
      </div>
      {ja.length > 0 && (
        <div className="issue ok">Já inscrito: {ja.map((x) => `${x.turma?.nome ?? "turma"} (${x.status === "confirmada" ? "confirmada" : "espera"})`).join(", ")}</div>
      )}
      <select className="field" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar modalidade">
        <option value="">Todas as modalidades para {a} anos ({permitidas.length} turmas)</option>
        {Object.keys(grupos).map((m) => <option key={m}>{m}</option>)}
      </select>
      <div style={{ display: "grid", gap: 14 }}>
        {Object.keys(grupos).length === 0 && <div className="empty">Nenhuma turma disponível para a idade de {a} anos.</div>}
        {Object.entries(grupos).filter(([m]) => !filtro || m === filtro).map(([m, ts]) => (
          <div className="modgrp" key={m}>
            <h3>{m}</h3>
            {ts.map((t) => {
              const marcada = escolhidas.some((s) => s.id === t.id);
              const st = estadoOpcao(t, escolhidas, ja, maxMatriculas);
              const bloqueada = st.bloqueada && !marcada;
              return (
                <button key={t.id} type="button" className="opt" aria-pressed={marcada} disabled={bloqueada} onClick={() => alternar(t.id)}>
                  <span className="box" aria-hidden>{marcada ? "✓" : ""}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="t">{t.nome}</span> <span className="hint">{faixaTxt(t)}</span>
                    <span className="meta">
                      <span className="dias">{DIAS.filter(([d]) => t.dias.includes(d)).map(([d, n]) => <span key={d} className="dia">{n}</span>)}</span>
                      <span className="hora">{hhmm(t.inicio)}–{hhmm(t.fim)}</span>
                      <span className="sub">{t.local}{t.professor ? ` · ${t.professor}` : ""}</span>
                    </span>
                  </span>
                  {t.vagas_livres > 0
                    ? <span className="chip ok">{t.vagas_livres} {t.vagas_livres === 1 ? "vaga" : "vagas"}</span>
                    : <span className="chip warn">Lista de espera{t.fila ? ` · ${t.fila} na fila` : ""}</span>}
                  {bloqueada && st.bloqueada && <span className="motivo">{st.motivo}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <ListaErros erros={erros} />
      <div className="foot">
        <button type="button" className="btn" onClick={onVoltar}>Voltar</button>
        <button type="button" className="btn primary" onClick={onAvancar}>Revisar e enviar</button>
      </div>
    </div>
  );
}

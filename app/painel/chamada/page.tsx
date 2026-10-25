"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePainel } from "@/components/painel/Painel";
import Aula, { type TurmaChamada } from "@/components/painel/Aula";
import { hhmm, hojeISO, norm } from "@/lib/regras";
import { professores, professoresIndividuais } from "@/lib/painel";

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const somarDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const diaDaSemana = (iso: string) => SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const dataLonga = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" });
type ChamadaDia = { id: string; turma_id: string; presentes: number; total: number };

export default function Chamada() {
  const { cliente, pode, perms } = usePainel();
  const todas = pode("chamada.todas");
  const [turmas, setTurmas] = useState<TurmaChamada[] | null>(null);
  const [prof, setProf] = useState(todas ? "" : perms.professor_nome || "");
  const [data, setData] = useState(hojeISO());
  const [feitas, setFeitas] = useState<Map<string, ChamadaDia>>(new Map());
  const [contagem, setContagem] = useState<Map<string, number>>(new Map());
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    cliente.from("turmas").select("id, codigo, nome, dias, inicio, fim, local, professor, ativa").order("inicio")
      .then(({ data: d }) => setTurmas(((d as (TurmaChamada & { ativa: boolean })[]) || []).filter((t) => t.ativa)));
    if (!todas) return;
    try { const salvo = localStorage.getItem("chamada.professor"); if (salvo) setProf(salvo); } catch { /* sem armazenamento local */ }
  }, [cliente, todas]);

  const carregarDia = useCallback(async () => {
    const { data: ch } = await cliente.from("chamadas").select("id, turma_id").eq("data", data);
    const lista = (ch as { id: string; turma_id: string }[]) || [];
    const pres = lista.length ? (await cliente.from("presencas").select("chamada_id, status").in("chamada_id", lista.map((c) => c.id))).data as { chamada_id: string; status: string }[] : [];
    setFeitas(new Map(lista.map((c) => {
      const p = (pres || []).filter((x) => x.chamada_id === c.id);
      return [c.turma_id, { ...c, total: p.length, presentes: p.filter((x) => x.status === "P").length }];
    })));
    // nº de alunos confirmados por turma (o professor só enxerga os das suas turmas)
    const { data: insc } = await cliente.from("inscricoes").select("turma_id").eq("status", "confirmada");
    const n = new Map<string, number>();
    for (const i of (insc as { turma_id: string }[]) || []) n.set(i.turma_id, (n.get(i.turma_id) || 0) + 1);
    setContagem(n);
  }, [cliente, data]);
  useEffect(() => { carregarDia(); }, [carregarDia]);

  const doDia = useMemo(() => (turmas || [])
    .filter((t) => t.dias.includes(diaDaSemana(data)) && (!prof || professores(t.professor).includes(norm(prof))))
    .sort((a, b) => a.inicio.localeCompare(b.inicio)), [turmas, data, prof]);

  if (!turmas) return <div className="empty">Carregando…</div>;
  if (!todas && !prof) {
    return <div className="empty">Seu usuário ainda não está vinculado a um professor do cronograma. Peça à coordenação para fazer o vínculo na seção Equipe.</div>;
  }
  const turmaAberta = turmas.find((t) => t.id === aberta);
  if (turmaAberta) {
    return <Aula turma={turmaAberta} data={data} onVoltar={() => { setAberta(null); carregarDia(); }} />;
  }

  const futuro = data > hojeISO();
  const quem = prof || "todos os professores";
  const feitasHoje = doDia.filter((t) => feitas.has(t.id)).length;
  return (
    <>
      <div className="card" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.3fr)", alignItems: "end" }}>
        <label className="f">Professor
          <select className="field" value={prof} disabled={!todas} onChange={(e) => {
            setProf(e.target.value);
            try { localStorage.setItem("chamada.professor", e.target.value); } catch { /* sem armazenamento local */ }
          }}>
            {todas ? <option value="">Todos os professores (coordenação)</option> : null}
            {(todas ? professoresIndividuais(turmas) : [prof]).map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <div className="f">
          <label htmlFor="data-aula">Data da aula</label>
          <span className="datas">
            <button type="button" className="btn" aria-label="Dia anterior" onClick={() => setData(somarDias(data, -1))}>‹</button>
            <input id="data-aula" type="date" className="field" value={data} onChange={(e) => e.target.value && setData(e.target.value)} />
            <button type="button" className="btn" aria-label="Próximo dia" onClick={() => setData(somarDias(data, 1))}>›</button>
            <button type="button" className="btn small" onClick={() => setData(hojeISO())}>Hoje</button>
          </span>
        </div>
      </div>
      <div className="dia-cab">
        <h2>{dataLonga(data)}</h2>
        <span className="sub">{doDia.length} {doDia.length === 1 ? "turma" : "turmas"} de {quem}{doDia.length && !futuro ? ` · ${feitasHoje} ${feitasHoje === 1 ? "chamada feita" : "chamadas feitas"}` : ""}</span>
      </div>
      {!doDia.length ? <div className="empty">Nenhuma turma de {quem} neste dia da semana.</div> : (
        <div className="aulas">
          {doDia.map((t) => {
            const c = feitas.get(t.id), n = contagem.get(t.id) || 0;
            return (
              <button type="button" key={t.id} className={`aula ${c ? "feita" : futuro ? "" : "pendente"}`} onClick={() => setAberta(t.id)}>
                <span className="hr">{hhmm(t.inicio)}–{hhmm(t.fim)}</span>
                <span style={{ fontWeight: 700 }}>{t.nome} <span className="codigo">{t.codigo}</span></span>
                <span className="sub">{t.local}{prof ? "" : ` · ${t.professor}`}</span>
                <span className="foot" style={{ alignItems: "center" }}>
                  <span className="sub">{n} {n === 1 ? "aluno" : "alunos"}</span>
                  {c ? <span className="chip ok">Feita · {c.presentes} de {c.total} presentes</span>
                    : futuro ? <span className="chip">Ainda não aconteceu</span> : <span className="chip warn">Pendente</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

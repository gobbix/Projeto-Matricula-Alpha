"use client";

import { useCallback, useEffect, useState } from "react";
import { usePainel } from "./Painel";
import { hhmm, hojeISO, idade } from "@/lib/regras";
import { baixarCsv, dataBR, dataHora } from "@/lib/painel";
import { mensagemErro } from "@/lib/supabase";

export type TurmaChamada = { id: string; codigo: string; nome: string; dias: string[]; inicio: string; fim: string; local: string; professor: string };
type Aluno = { id: string; participante_nome: string; participante_nasc: string };
type Freq = { inscricao_id: string; participante: string; aulas: number; faltas: number; justificadas: number; pct: number; ultimas: string[]; alerta: boolean };
type Marca = "P" | "F" | "J";
const ROTULO: Record<Marca, string> = { P: "Presente", F: "Falta", J: "Falta justificada" };

export default function Aula({ turma, data, onVoltar }: { turma: TurmaChamada; data: string; onVoltar: () => void }) {
  const { cliente, pode } = usePainel();
  const [alunos, setAlunos] = useState<Aluno[] | null>(null);
  const [marcas, setMarcas] = useState<Record<string, Marca>>({});
  const [obs, setObs] = useState("");
  const [salvaEm, setSalvaEm] = useState<string | null>(null);
  const [alterado, setAlterado] = useState(false);
  const [freq, setFreq] = useState<Freq[]>([]);
  const [historico, setHistorico] = useState<{ data: string; marcas: Map<string, string> }[]>([]);
  const [aba, setAba] = useState<"chamada" | "freq">("chamada");
  const [msg, setMsg] = useState<{ tipo: "ok" | "bad"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());
  const [desligar, setDesligar] = useState<{ aluno: Aluno | Freq; motivo: string; ok: boolean } | null>(null);
  const aprova = pode("desligamento.aprovar");
  const solicita = pode("desligamento.solicitar") || aprova;
  const futuro = data > hojeISO();

  const carregar = useCallback(async () => {
    const [a, ch, f, sol, todas] = await Promise.all([
      cliente.from("inscricoes").select("id, participante_nome, participante_nasc").eq("turma_id", turma.id).eq("status", "confirmada").order("participante_nome"),
      cliente.from("chamadas").select("id, obs, registrado_em").eq("turma_id", turma.id).eq("data", data).maybeSingle(),
      cliente.rpc("frequencia_turma", { p_turma: turma.id }),
      cliente.from("solicitacoes").select("inscricao_id").eq("status", "pendente"),
      cliente.from("chamadas").select("id, data").eq("turma_id", turma.id).order("data"),
    ]);
    setAlunos((a.data as Aluno[]) || []);
    setFreq((f.data as Freq[]) || []);
    setPendentes(new Set(((sol.data as { inscricao_id: string }[]) || []).map((s) => s.inscricao_id)));
    const lista = (todas.data as { id: string; data: string }[]) || [];
    const pres = lista.length ? ((await cliente.from("presencas").select("chamada_id, inscricao_id, status").in("chamada_id", lista.map((c) => c.id))).data as { chamada_id: string; inscricao_id: string; status: string }[]) || [] : [];
    setHistorico(lista.map((c) => ({ data: c.data, marcas: new Map(pres.filter((p) => p.chamada_id === c.id).map((p) => [p.inscricao_id, p.status])) })));
    const atual = ch.data as { id: string; obs: string; registrado_em: string } | null;
    if (atual) {
      setObs(atual.obs); setSalvaEm(atual.registrado_em);
      setMarcas(Object.fromEntries(pres.filter((p) => p.chamada_id === atual.id).map((p) => [p.inscricao_id, p.status as Marca])));
    }
    setAlterado(false);
  }, [cliente, turma.id, data]);
  useEffect(() => { carregar(); }, [carregar]);

  if (!alunos) return <div className="empty">Carregando alunos…</div>;
  const freqDe = new Map(freq.map((x) => [x.inscricao_id, x]));
  // alunos que estavam numa chamada salva mas saíram da turma
  const saidos = Object.keys(marcas).filter((id) => !alunos.some((a) => a.id === id))
    .map((id) => ({ id, participante_nome: freqDe.get(id)?.participante ?? "Aluno", participante_nasc: "", saiu: true }));
  const todos = [...alunos.map((a) => ({ ...a, saiu: false })), ...saidos];
  const cont = { P: 0, F: 0, J: 0 };
  todos.forEach((a) => { const m = marcas[a.id]; if (m) cont[m]++; });
  const semMarca = todos.length - cont.P - cont.F - cont.J;

  const marcar = (id: string, m: Marca) => { setMarcas((x) => ({ ...x, [id]: x[id] === m ? (undefined as unknown as Marca) : m })); setAlterado(true); setMsg(null); };
  async function salvar() {
    if (semMarca) return setMsg({ tipo: "bad", texto: `Marque todos os alunos antes de salvar (${semMarca} sem marcação).` });
    setSalvando(true);
    const { error } = await cliente.rpc("salvar_chamada", {
      p_turma: turma.id, p_data: data, p_obs: obs.trim(),
      p_presencas: todos.map((a) => ({ inscricao_id: a.id, status: marcas[a.id] })),
    });
    setSalvando(false);
    if (error) return setMsg({ tipo: "bad", texto: mensagemErro(error) });
    setMsg({ tipo: "ok", texto: `Chamada salva: ${cont.P} presentes, ${cont.F} faltas${cont.J ? `, ${cont.J} justificadas` : ""}.` });
    carregar();
  }
  async function confirmarDesligamento() {
    if (!desligar) return;
    const id = "id" in desligar.aluno ? desligar.aluno.id : desligar.aluno.inscricao_id;
    const nome = "participante_nome" in desligar.aluno ? desligar.aluno.participante_nome : desligar.aluno.participante;
    if (!desligar.motivo.trim()) return setMsg({ tipo: "bad", texto: "Informe o motivo." });
    const r = aprova
      ? await cliente.rpc("desligar_direto", { p_inscricao: id, p_motivo: desligar.motivo })
      : await cliente.rpc("solicitar_desligamento", { p_inscricao: id, p_motivo: desligar.motivo });
    if (r.error) return setMsg({ tipo: "bad", texto: mensagemErro(r.error) });
    const chamados = aprova ? ((r.data as { participante_nome: string }[]) || []).map((x) => x.participante_nome) : [];
    setMsg({ tipo: "ok", texto: aprova
      ? `${nome} foi desligado(a). ${chamados.length ? `${chamados.join(", ")} chamado(a) da lista de espera.` : "Ninguém elegível na lista de espera; a vaga ficou livre."} As mensagens aos titulares estão na seção Inscrições.`
      : `Solicitação enviada para a coordenação. ${nome.split(" ")[0]} continua na turma até a aprovação.` });
    setDesligar(null);
    carregar();
  }
  function abrirDesligamento(a: Aluno | Freq) {
    const f = freqDe.get("id" in a ? a.id : a.inscricao_id);
    setDesligar({ aluno: a, ok: false, motivo: f ? `Excesso de faltas: ${f.faltas} ${f.faltas === 1 ? "falta" : "faltas"} em ${f.aulas} aulas (${f.pct}% de presença).` : "Excesso de faltas." });
    window.scrollTo({ top: 0 });
  }
  const botaoDesligar = (a: Aluno | Freq) => {
    const id = "id" in a ? a.id : a.inscricao_id;
    if (!solicita || !alunos.some((x) => x.id === id)) return null;
    if (pendentes.has(id)) return <span className="chip warn">Desligamento solicitado</span>;
    return <button type="button" className="btn small danger" onClick={() => abrirDesligamento(a)}>{aprova ? "Desligar por faltas" : "Solicitar desligamento"}</button>;
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ gap: 8 }}>
        <div><button type="button" className="btn small" onClick={onVoltar}>‹ Turmas do dia</button></div>
        <div className="dia-cab"><h2 style={{ textTransform: "none" }}>{turma.nome}</h2><span className="codigo">{turma.codigo}</span></div>
        <div className="sub">{dataBR(data)} · {hhmm(turma.inicio)}–{hhmm(turma.fim)} · {turma.local} · {turma.professor}</div>
        <div className="ptabs" role="group" aria-label="Visualização">
          <button type="button" aria-pressed={aba === "chamada"} onClick={() => setAba("chamada")}>Chamada</button>
          <button type="button" aria-pressed={aba === "freq"} onClick={() => setAba("freq")}>Frequência da turma</button>
        </div>
      </div>
      {msg && <div className={`issue ${msg.tipo}`} role={msg.tipo === "bad" ? "alert" : "status"}>{msg.texto}</div>}

      {desligar && (() => {
        const nome = "participante_nome" in desligar.aluno ? desligar.aluno.participante_nome : desligar.aluno.participante;
        const f = freqDe.get("id" in desligar.aluno ? desligar.aluno.id : desligar.aluno.inscricao_id);
        return (
          <div className="card desliga" role="alertdialog" aria-labelledby="desliga-titulo">
            <h2 id="desliga-titulo">{aprova ? "Desligar aluno por faltas" : "Solicitar desligamento por faltas"}</h2>
            <p style={{ margin: 0 }}>{aprova
              ? <><b>{nome}</b> será desligado(a) de <b>{turma.nome}</b>. A matrícula é cancelada, o titular recebe o aviso e o próximo elegível da lista de espera é chamado.</>
              : <>O pedido de desligamento de <b>{nome}</b> vai para a coordenação. Nada muda até a aprovação.</>}</p>
            {f && <div className="toolbar"><span className="chip bad">{f.pct}% presença</span><span className="chip">{f.faltas} faltas em {f.aulas} aulas</span><span className="hint">Últimas: {f.ultimas.join(" ")}</span></div>}
            <label className="f">Motivo (fica registrado)<textarea className="field" rows={2} value={desligar.motivo} onChange={(e) => setDesligar({ ...desligar, motivo: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={desligar.ok} onChange={(e) => setDesligar({ ...desligar, ok: e.target.checked })} />
              <span>{aprova ? `Confirmo o desligamento de ${nome.split(" ")[0]}.` : `Confirmo que quero solicitar o desligamento de ${nome.split(" ")[0]} por faltas.`}</span></label>
            <div className="foot">
              <button type="button" className="btn" onClick={() => setDesligar(null)}>Voltar</button>
              <button type="button" className="btn danger armado" disabled={!desligar.ok} onClick={confirmarDesligamento}>{aprova ? "Confirmar desligamento" : "Enviar solicitação"}</button>
            </div>
          </div>
        );
      })()}

      {aba === "chamada" ? (
        futuro ? <div className="empty">Esta aula ainda não aconteceu. A chamada pode ser feita a partir do dia {dataBR(data)}.</div>
        : !todos.length ? <div className="empty">Nenhum aluno com matrícula confirmada nesta turma.</div> : (
          <>
            <div className="toolbar">
              <button type="button" className="btn small" onClick={() => { setMarcas((x) => ({ ...Object.fromEntries(alunos.map((a) => [a.id, "P" as Marca])), ...Object.fromEntries(Object.entries(x).filter(([, v]) => v)) })); setAlterado(true); }}>Todos presentes</button>
              <span className="chip ok">{cont.P} presentes</span><span className="chip bad">{cont.F} faltas</span><span className="chip warn">{cont.J} justificadas</span>
              {semMarca > 0 && <span className="chip">{semMarca} sem marcar</span>}
            </div>
            <div className="alunos">
              {todos.map((a) => {
                const f = freqDe.get(a.id), anos = a.participante_nasc ? idade(a.participante_nasc, data) : null;
                return (
                  <div className="aluno" key={a.id}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{a.participante_nome}</div>
                      <div className="info">
                        {anos != null && <span className="hint">{anos} anos</span>}
                        {a.saiu && <span className="chip">Não está mais na turma</span>}
                        {f && <span className={`chip ${f.alerta ? "bad" : ""}`}>{f.pct}% presença{f.faltas ? ` · ${f.faltas} ${f.faltas === 1 ? "falta" : "faltas"}` : ""}</span>}
                        {f?.alerta && <span className="chip bad">Atenção</span>}
                        {f?.alerta && botaoDesligar(a)}
                      </div>
                    </div>
                    <div className="seg" role="group" aria-label={`Presença de ${a.participante_nome}`}>
                      {(["P", "F", "J"] as Marca[]).map((m) => (
                        <button key={m} type="button" data-s={m} aria-pressed={marcas[a.id] === m} title={ROTULO[m]} aria-label={`${ROTULO[m]}: ${a.participante_nome}`} onClick={() => marcar(a.id, m)}>{m}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <label className="f">Observações da aula<textarea className="field" rows={2} value={obs} onChange={(e) => { setObs(e.target.value); setAlterado(true); }} placeholder="Ex.: aula na quadra coberta por causa da chuva" /></label>
            <div className="salvar-fixo">
              <span className="hint">{salvaEm ? `Chamada salva em ${dataHora(salvaEm)}${alterado ? " · alterações não salvas" : ""}` : alterado ? "Chamada ainda não salva" : "P = presente · F = falta · J = falta justificada"}</span>
              <button type="button" className="btn primary" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : salvaEm ? "Atualizar chamada" : "Salvar chamada"}</button>
            </div>
          </>
        )
      ) : !historico.length ? <div className="empty">Nenhuma chamada registrada nesta turma ainda.</div> : (
        <>
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <span className="sub">{historico.length} {historico.length === 1 ? "aula registrada" : "aulas registradas"} · alerta com presença abaixo de 75% ou 3 faltas seguidas</span>
            <button type="button" className="btn small" onClick={() => baixarCsv(`frequencia-${turma.codigo}.csv`, ["Aluno", ...historico.map((h) => dataBR(h.data)), "Presença %", "Faltas"],
              freq.map((f) => [f.participante, ...historico.map((h) => h.marcas.get(f.inscricao_id) || ""), f.pct, f.faltas]))}>Exportar frequência</button>
          </div>
          <div className="tabela">
            <table style={{ minWidth: 300 + historico.length * 46 }}>
              <thead><tr><th>Aluno</th>{historico.map((h) => <th key={h.data} style={{ textAlign: "center" }}>{dataBR(h.data).slice(0, 5)}</th>)}<th>Presença</th></tr></thead>
              <tbody>
                {freq.map((f) => (
                  <tr key={f.inscricao_id}>
                    <td><b>{f.participante}</b>{f.alerta && <> <span className="chip bad">Atenção</span></>}</td>
                    {historico.map((h) => { const s = h.marcas.get(f.inscricao_id); return <td key={h.data} className={`pf ${s || ""}`}>{s || "–"}</td>; })}
                    <td className="n">{f.pct}% · {f.faltas} {f.faltas === 1 ? "falta" : "faltas"}{f.faltas > 0 && <><br />{botaoDesligar(f)}</>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

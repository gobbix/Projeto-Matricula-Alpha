"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePainel } from "@/components/painel/Painel";
import FormTurma, { type Rascunho } from "@/components/painel/FormTurma";
import { DIAS, diasTxt, faixaTxt, hhmm, norm } from "@/lib/regras";
import { baixarCsv, conflitos, professores, professoresIndividuais, useConfirmacao, type Ocupacao, type TurmaCompleta } from "@/lib/painel";
import { mensagemErro } from "@/lib/supabase";

const NOVA: Rascunho = {
  codigo: "", modalidade: "", nome: "", idade_min: null, idade_max: null, faixa_revisar: false, dias: [], inicio: "", fim: "",
  local: "", professor: "", local_compartilhado: false, vagas: 0, ativa: true, obs: "",
};
type Filtro = null | "zero" | "revisar" | "conflito";
const ordem = (a: TurmaCompleta, b: TurmaCompleta) =>
  a.modalidade.localeCompare(b.modalidade, "pt")
  || Math.min(...a.dias.map((d) => DIAS.findIndex(([x]) => x === d))) - Math.min(...b.dias.map((d) => DIAS.findIndex(([x]) => x === d)))
  || a.inicio.localeCompare(b.inicio) || a.codigo.localeCompare(b.codigo);

export default function Turmas() {
  const { cliente, pode } = usePainel();
  const editar = pode("turmas.editar");
  const [turmas, setTurmas] = useState<TurmaCompleta[] | null>(null);
  const [ocupacao, setOcupacao] = useState<Map<string, Ocupacao>>(new Map());
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [busca, setBusca] = useState("");
  const [modalidade, setModalidade] = useState("");
  const [dia, setDia] = useState("");
  const [prof, setProf] = useState("");
  const [filtro, setFiltro] = useState<Filtro>(null);
  const [aberta, setAberta] = useState<Rascunho | null>(null);
  const [vagasLote, setVagasLote] = useState(15);
  const { armado, confirmar } = useConfirmacao(6000);
  const pendentes = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const carregar = useCallback(async () => {
    const [t, o] = await Promise.all([cliente.from("turmas").select("*").order("codigo"), cliente.from("ocupacao").select("*")]);
    if (t.error) return setErro(mensagemErro(t.error));
    setTurmas(t.data as TurmaCompleta[]);
    setOcupacao(new Map(((o.data as Ocupacao[]) || []).map((x) => [x.turma_id, x])));
  }, [cliente]);
  useEffect(() => { carregar(); }, [carregar]);

  const conf = useMemo(() => conflitos(turmas || []), [turmas]);
  if (!turmas) return erro ? <div className="issue bad">{erro}</div> : <div className="empty">Carregando turmas…</div>;

  const ativas = turmas.filter((t) => t.ativa);
  const lista = turmas.filter((t) => {
    if (modalidade && t.modalidade !== modalidade) return false;
    if (dia && !t.dias.includes(dia)) return false;
    if (prof && !professores(t.professor).includes(norm(prof))) return false;
    if (busca && !norm([t.codigo, t.nome, t.modalidade, t.professor, t.local].join(" ")).includes(norm(busca))) return false;
    if (filtro === "zero" && !(t.ativa && !t.vagas)) return false;
    if (filtro === "revisar" && !t.faixa_revisar) return false;
    if (filtro === "conflito" && !conf.has(t.id)) return false;
    return true;
  }).sort(ordem);
  const grupos = lista.reduce<Record<string, TurmaCompleta[]>>((g, t) => ((g[t.modalidade] ??= []).push(t), g), {});

  // vagas: grava uma vez por turma, depois de uma pausa na digitação
  function mudarVagas(t: TurmaCompleta, n: number) {
    n = Math.max(0, Math.floor(n || 0));
    setTurmas((ts) => ts!.map((x) => (x.id === t.id ? { ...x, vagas: n } : x)));
    clearTimeout(pendentes.current.get(t.id));
    pendentes.current.set(t.id, setTimeout(async () => {
      const { error } = await cliente.from("turmas").update({ vagas: n }).eq("id", t.id);
      if (error) setErro(mensagemErro(error));
    }, 600));
  }
  async function aplicarLote() {
    if (!confirmar("lote")) return;
    const { error } = await cliente.from("turmas").update({ vagas: vagasLote }).in("id", lista.map((t) => t.id));
    if (error) return setErro(mensagemErro(error));
    setAviso(`${lista.length} turmas atualizadas com ${vagasLote} vagas.`);
    carregar();
  }
  async function salvar(t: Rascunho): Promise<string | null> {
    const { id, ...dados } = t;
    const r = id ? await cliente.from("turmas").update(dados).eq("id", id) : await cliente.from("turmas").insert(dados);
    if (r.error) return mensagemErro(r.error);
    setAberta(null); setAviso(`Turma ${t.codigo} ${id ? "salva" : "criada"}.`); carregar();
    return null;
  }
  async function excluir(t: TurmaCompleta): Promise<string | null> {
    const { data, error } = await cliente.from("turmas").delete().eq("id", t.id).select("id");
    if (error) return mensagemErro(error);
    if (!data?.length) return "A turma não pôde ser excluída: ela tem inscrições. Marque-a como Inativa.";
    setAberta(null); setAviso(`Turma ${t.codigo} excluída.`); carregar();
    return null;
  }
  function exportar() {
    baixarCsv("turmas-alphaville.csv",
      ["Código", "Modalidade", "Turma", "Idade mín.", "Idade máx.", "Faixa a revisar", "Dias", "Início", "Término", "Local", "Professor", "Vagas", "Confirmadas", "Espera", "Ativa", "Observações"],
      [...turmas!].sort(ordem).map((t) => {
        const o = ocupacao.get(t.id);
        return [t.codigo, t.modalidade, t.nome, t.idade_min, t.idade_max, t.faixa_revisar ? "sim" : "não", diasTxt(t.dias), hhmm(t.inicio), hhmm(t.fim),
          t.local, t.professor, t.vagas, o?.confirmadas ?? 0, o?.espera ?? 0, t.ativa ? "sim" : "não", t.obs];
      }));
  }

  const stats: [Filtro, string, string, number][] = [
    [null, "", "Turmas ativas", ativas.length],
    [null, "", "Vagas ofertadas", ativas.reduce((s, t) => s + t.vagas, 0)],
    ["zero", "warn", "Com vagas a definir", ativas.filter((t) => !t.vagas).length],
    ["revisar", "warn", "Faixa etária a revisar", turmas.filter((t) => t.faixa_revisar).length],
    ["conflito", "bad", "Com conflito de horário", conf.size],
  ];

  return (
    <>
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <button type="button" className="btn" onClick={exportar}>Exportar turmas</button>
        {editar && <button type="button" className="btn primary" onClick={() => setAberta({ ...NOVA, modalidade })}>+ Nova turma</button>}
      </div>
      {erro && <div className="issue bad" role="alert">{erro}</div>}
      {aviso && <div className="issue ok" role="status">{aviso}</div>}
      <section className="resumo" aria-label="Resumo">
        {stats.map(([k, cls, rotulo, n]) => (
          <button key={rotulo} type="button" className={`stat ${cls}`} disabled={!k} aria-pressed={k ? filtro === k : undefined}
            onClick={() => k && setFiltro(filtro === k ? null : k)}>
            <span className="num">{n}</span><span className="lbl">{rotulo}</span>
          </button>
        ))}
      </section>
      <div className="toolbar">
        <input type="search" className="field" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código, turma, professor ou local" aria-label="Buscar" />
        <select className="field" value={modalidade} onChange={(e) => setModalidade(e.target.value)} aria-label="Modalidade">
          <option value="">Todas as modalidades</option>
          {[...new Set(turmas.map((t) => t.modalidade))].sort().map((m) => <option key={m}>{m}</option>)}
        </select>
        <select className="field" value={dia} onChange={(e) => setDia(e.target.value)} aria-label="Dia da semana">
          <option value="">Todos os dias</option>
          {DIAS.map(([d, n]) => <option key={d} value={d}>{n}</option>)}
        </select>
        <select className="field" value={prof} onChange={(e) => setProf(e.target.value)} aria-label="Professor">
          <option value="">Todos os professores</option>
          {professoresIndividuais(turmas).map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>
      {editar && (
        <div className="lote">
          <span>Definir</span>
          <input type="number" min={0} className="field" value={vagasLote} onChange={(e) => setVagasLote(Math.max(0, +e.target.value || 0))} aria-label="Vagas em lote" />
          <span>vagas para as <b>{lista.length}</b> turmas filtradas</span>
          <button type="button" className={`btn ${armado === "lote" ? "primary" : ""}`} onClick={aplicarLote} disabled={!lista.length}>
            {armado === "lote" ? `Confirmar: ${vagasLote} vagas em ${lista.length} turmas` : "Aplicar"}
          </button>
        </div>
      )}
      {!lista.length ? <div className="empty">{turmas.length ? "Nenhuma turma corresponde aos filtros." : "Nenhuma turma cadastrada ainda."}</div> : (
        <div style={{ display: "grid", gap: 14 }}>
          {Object.entries(grupos).map(([mod, ts]) => (
            <section className="grupo" key={mod}>
              <h2>{mod}<small>{ts.length} turma{ts.length > 1 ? "s" : ""} · {ts.reduce((s, t) => s + (t.ativa ? t.vagas : 0), 0)} vagas</small></h2>
              <div className="linha cab"><div>Cód.</div><div>Turma</div><div>Faixa</div><div>Dias</div><div>Horário</div><div>Local · Professor</div><div>Vagas</div><div /></div>
              {ts.map((t) => {
                const c = conf.get(t.id), o = ocupacao.get(t.id);
                return (
                  <div className={`linha ${t.ativa ? "" : "off"}`} key={t.id}>
                    <div className="c-cod codigo">{t.codigo}</div>
                    <div className="c-nome" style={{ fontWeight: 600, minWidth: 0 }}>
                      {t.nome}
                      <div className="flags">
                        {!t.ativa && <span className="chip">Inativa</span>}
                        {t.faixa_revisar && <span className="chip warn">Faixa a revisar</span>}
                        {c && <span className="chip bad" title={c.map((x) => `${x.outra.codigo} (${x.motivo.join(" e ")})`).join(", ")}>Conflito com {c.map((x) => x.outra.codigo).join(", ")}</span>}
                      </div>
                    </div>
                    <div className="c-faixa"><span className={`chip ${t.faixa_revisar ? "warn" : ""}`}>{faixaTxt(t)}</span></div>
                    <div className="c-dias dias">{DIAS.filter(([d]) => t.dias.includes(d)).map(([d, n]) => <span key={d} className="dia">{n}</span>)}</div>
                    <div className="c-hora hora">{hhmm(t.inicio)} às {hhmm(t.fim)}</div>
                    <div className="c-local sub"><span className="lbl-m">Local</span>{t.local || "—"}<br /><span className="lbl-m">Prof.</span>{t.professor || "Sem professor"}</div>
                    <div className="c-vagas">
                      <span className={`stepper ${t.vagas ? "" : "zero"}`}>
                        {editar && <button type="button" aria-label={`Menos uma vaga em ${t.codigo}`} onClick={() => mudarVagas(t, t.vagas - 1)}>−</button>}
                        <input type="number" min={0} value={t.vagas} readOnly={!editar} aria-label={`Vagas de ${t.codigo}`} onChange={(e) => mudarVagas(t, +e.target.value)} />
                        {editar && <button type="button" aria-label={`Mais uma vaga em ${t.codigo}`} onClick={() => mudarVagas(t, t.vagas + 1)}>+</button>}
                      </span>
                      <div className="ocup">{o?.confirmadas ?? 0} confirmadas · {o?.espera ?? 0} espera</div>
                    </div>
                    <div className="c-acoes"><button type="button" className="btn small" onClick={() => setAberta(t)}>{editar ? "Editar" : "Ver"}</button></div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
      <FormTurma turma={aberta} turmas={turmas} ocupacao={ocupacao} podeEditar={editar} onFechar={() => setAberta(null)}
        onSalvar={salvar} onExcluir={excluir} onDuplicar={(t) => setAberta(t)} />
    </>
  );
}

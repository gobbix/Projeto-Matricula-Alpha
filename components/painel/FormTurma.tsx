"use client";

import { useEffect, useRef, useState } from "react";
import { DIAS, norm } from "@/lib/regras";
import { conflitos, proximoCodigo, useConfirmacao, type Ocupacao, type TurmaCompleta } from "@/lib/painel";

const IDADE_ADULTO = 16;
type Modo = "faixa" | "minimo" | "adulto" | "livre";
export type Rascunho = Omit<TurmaCompleta, "id"> & { id?: string };

type Props = {
  turma: Rascunho | null; // null = fechado
  turmas: TurmaCompleta[];
  ocupacao: Map<string, Ocupacao>;
  podeEditar: boolean;
  onFechar: () => void;
  onSalvar: (t: Rascunho) => Promise<string | null>; // devolve mensagem de erro ou null
  onExcluir: (t: TurmaCompleta) => Promise<string | null>;
  onDuplicar: (t: Rascunho) => void;
};

const modoDe = (t: Rascunho): Modo =>
  t.idade_min == null && t.idade_max == null ? "livre"
  : t.idade_min === IDADE_ADULTO && t.idade_max == null ? "adulto"
  : t.idade_max == null ? "minimo" : "faixa";

export default function FormTurma({ turma, turmas, ocupacao, podeEditar, onFechar, onSalvar, onExcluir, onDuplicar }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState<Rascunho | null>(turma);
  const [modo, setModo] = useState<Modo>("livre");
  const [mostrarErros, setMostrarErros] = useState(false);
  const [erroServidor, setErroServidor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const { armado, confirmar } = useConfirmacao();

  useEffect(() => {
    setF(turma); setMostrarErros(false); setErroServidor("");
    if (turma) { setModo(modoDe(turma)); if (!dlg.current?.open) dlg.current?.showModal(); }
    else dlg.current?.close();
  }, [turma]);

  if (!f) return <dialog ref={dlg} onClose={onFechar} />;
  const editando = !!f.id;
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setF({ ...f, [k]: v });
  const num = (v: string) => (v === "" ? null : Math.max(0, Math.floor(+v)));
  const comFaixa = (m: Modo, t: Rascunho): Rascunho =>
    m === "livre" ? { ...t, idade_min: null, idade_max: null }
    : m === "adulto" ? { ...t, idade_min: IDADE_ADULTO, idade_max: null }
    : m === "minimo" ? { ...t, idade_max: null } : t;
  const final = comFaixa(modo, f);

  // validação
  const erros: string[] = [], avisos: string[] = [];
  if (!final.modalidade.trim()) erros.push("Informe a modalidade.");
  if (!final.nome.trim()) erros.push("Informe o nome da turma.");
  if (!final.dias.length) erros.push("Marque pelo menos um dia da semana.");
  if (!final.inicio || !final.fim) erros.push("Informe o horário de início e de término.");
  else if (final.fim.slice(0, 5) <= final.inicio.slice(0, 5)) erros.push("O término precisa ser depois do início.");
  if (modo === "faixa" && (final.idade_min == null || final.idade_max == null)) erros.push("Informe a idade inicial e a final da faixa.");
  if (modo === "minimo" && final.idade_min == null) erros.push("Informe a idade mínima.");
  if (final.idade_min != null && final.idade_max != null && final.idade_min > final.idade_max) erros.push("A idade inicial não pode ser maior que a final.");
  const cod = final.codigo.trim().toUpperCase();
  if (cod && turmas.some((t) => t.codigo === cod && t.id !== final.id)) erros.push(`O código ${cod} já está em uso por outra turma.`);
  const igual = turmas.find((t) => t.id !== final.id && norm(t.nome) === norm(final.nome) && t.idade_min === final.idade_min
    && t.idade_max === final.idade_max && [...t.dias].sort().join() === [...final.dias].sort().join() && t.inicio.slice(0, 5) === final.inicio.slice(0, 5));
  if (igual && final.nome) erros.push(`Já existe uma turma igual (${igual.codigo}): mesmo nome, faixa, dias e horário.`);
  if (!final.professor.trim()) avisos.push("Turma sem professor definido.");
  if (final.ativa && !final.vagas) avisos.push("Turma ativa com 0 vagas: todos os inscritos irão para a lista de espera.");
  const oc = final.id ? ocupacao.get(final.id) : undefined;
  if (oc && final.vagas < oc.confirmadas) avisos.push(`A turma já tem ${oc.confirmadas} matrículas confirmadas, mais do que ${final.vagas} vagas. Ninguém é removido automaticamente.`);
  if (!erros.length) {
    const c = conflitos([...turmas.filter((t) => t.id !== final.id), { ...final, id: "__nova" } as TurmaCompleta]).get("__nova") || [];
    c.forEach((x) => avisos.push(`Conflito de ${x.motivo.join(" e ")} com ${x.outra.codigo} (${x.outra.nome}, ${x.outra.inicio.slice(0, 5)}–${x.outra.fim.slice(0, 5)}).`));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setMostrarErros(true);
    if (erros.length || !podeEditar) return;
    setSalvando(true);
    const msg = await onSalvar({ ...final, codigo: cod || proximoCodigo(final.modalidade.trim(), turmas), modalidade: final.modalidade.trim(), nome: final.nome.trim() });
    setSalvando(false);
    if (msg) setErroServidor(msg);
  }
  async function excluir() {
    if (!editando) return;
    if (oc && oc.confirmadas + oc.espera > 0) return setErroServidor(`Esta turma tem ${oc.confirmadas + oc.espera} inscrições ativas. Marque-a como Inativa em vez de excluir.`);
    if (!confirmar("excluir")) return;
    const msg = await onExcluir(final as TurmaCompleta);
    if (msg) setErroServidor(msg);
  }

  const modalidades = [...new Set(turmas.map((t) => t.modalidade))].sort();
  const locais = [...new Set(turmas.map((t) => t.local).filter(Boolean))].sort();
  const profs = [...new Set(turmas.map((t) => t.professor).filter(Boolean))].sort();

  return (
    <dialog ref={dlg} onClose={onFechar} aria-labelledby="form-turma-titulo">
      <form onSubmit={salvar} noValidate>
        <div className="dlg-cab">
          <h2 id="form-turma-titulo">{editando ? `Turma ${f.codigo}` : "Nova turma"}</h2>
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>Fechar</button>
        </div>
        <fieldset disabled={!podeEditar} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="dlg-corpo">
            <div className="grid2">
              <label className="f">Modalidade<input className="field" list="dl-mod" value={f.modalidade} onChange={(e) => set("modalidade", e.target.value)} /></label>
              <label className="f">Código<input className="field" value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="Gerado automaticamente" /></label>
            </div>
            <label className="f">Nome da turma<input className="field" value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Natação Iniciação I" /></label>
            <fieldset>
              <legend>Faixa etária</legend>
              <div className="opcoes">
                {([["faixa", "Faixa definida"], ["minimo", "Idade mínima"], ["adulto", `Adulto (${IDADE_ADULTO}+)`], ["livre", "Livre"]] as const).map(([m, r]) => (
                  <label key={m}><input type="radio" name="faixa" checked={modo === m} onChange={() => setModo(m)} /> {r}</label>
                ))}
              </div>
              {(modo === "faixa" || modo === "minimo") && (
                <div className="idades">
                  <label className="f">De<input className="field" type="number" min={0} max={99} value={f.idade_min ?? ""} onChange={(e) => set("idade_min", num(e.target.value))} /></label>
                  {modo === "faixa" && <label className="f">até<input className="field" type="number" min={0} max={99} value={f.idade_max ?? ""} onChange={(e) => set("idade_max", num(e.target.value))} /></label>}
                  <span className="hint">anos, conferido na data da inscrição</span>
                </div>
              )}
              <label className="check hint"><input type="checkbox" checked={f.faixa_revisar} onChange={(e) => set("faixa_revisar", e.target.checked)} /> Faixa etária ainda precisa ser revisada</label>
            </fieldset>
            <fieldset>
              <legend>Dias e horário</legend>
              <div className="opcoes">
                {DIAS.map(([d, n]) => (
                  <label key={d}><input type="checkbox" checked={f.dias.includes(d)}
                    onChange={(e) => set("dias", e.target.checked ? [...f.dias, d] : f.dias.filter((x) => x !== d))} /> {n}</label>
                ))}
              </div>
              <div className="grid2">
                <label className="f">Início<input className="field" type="time" value={f.inicio.slice(0, 5)} onChange={(e) => set("inicio", e.target.value)} /></label>
                <label className="f">Término<input className="field" type="time" value={f.fim.slice(0, 5)} onChange={(e) => set("fim", e.target.value)} /></label>
              </div>
            </fieldset>
            <div className="grid2">
              <label className="f">Local<input className="field" list="dl-local" value={f.local} onChange={(e) => set("local", e.target.value)} /></label>
              <label className="f">Professor<input className="field" list="dl-prof" value={f.professor} onChange={(e) => set("professor", e.target.value)} /></label>
            </div>
            <label className="check hint"><input type="checkbox" checked={f.local_compartilhado} onChange={(e) => set("local_compartilhado", e.target.checked)} /> Este local comporta turmas ao mesmo tempo (ex.: campo dividido)</label>
            <div className="grid2">
              <label className="f">Vagas<input className="field" type="number" min={0} value={f.vagas} onChange={(e) => set("vagas", num(e.target.value) ?? 0)} /></label>
              <label className="f">Situação
                <select className="field" value={f.ativa ? "1" : "0"} onChange={(e) => set("ativa", e.target.value === "1")}>
                  <option value="1">Ativa (aparece na inscrição)</option><option value="0">Inativa (oculta)</option>
                </select>
              </label>
            </div>
            <label className="f">Observações internas<textarea className="field" rows={2} value={f.obs} onChange={(e) => set("obs", e.target.value)} /></label>
            <div style={{ display: "grid", gap: 6 }} aria-live="polite">
              {erroServidor && <div className="issue bad">{erroServidor}</div>}
              {mostrarErros && erros.map((m) => <div key={m} className="issue bad">{m}</div>)}
              {avisos.map((m) => <div key={m} className="issue warn">{m}</div>)}
            </div>
          </div>
        </fieldset>
        <div className="dlg-rodape">
          <div className="toolbar">
            {editando && podeEditar && <button type="button" className={`btn danger ${armado === "excluir" ? "armado" : ""}`} onClick={excluir}>{armado === "excluir" ? `Confirmar exclusão de ${f.codigo}` : "Excluir turma"}</button>}
            {editando && podeEditar && <button type="button" className="btn" onClick={() => onDuplicar({ ...final, id: undefined, codigo: "" })}>Duplicar</button>}
          </div>
          <div className="toolbar">
            <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancelar</button>
            {podeEditar && <button type="submit" className="btn primary" disabled={salvando}>{salvando ? "Salvando…" : "Salvar turma"}</button>}
          </div>
        </div>
      </form>
      <datalist id="dl-mod">{modalidades.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="dl-local">{locais.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="dl-prof">{profs.map((m) => <option key={m} value={m} />)}</datalist>
    </dialog>
  );
}

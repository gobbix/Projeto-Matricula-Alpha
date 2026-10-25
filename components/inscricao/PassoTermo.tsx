"use client";

import { diasTxt, hhmm, idade, parseNasc, type Config, type Participante, type Titular, type Turma } from "@/lib/regras";
import { ListaErros } from "./Inscricao";

type Props = {
  titular: Titular;
  participantes: Participante[];
  selecao: Record<string, string[]>;
  turmas: Turma[];
  config: Config;
  lgpd: boolean;
  onLgpd: (v: boolean) => void;
  responsavel: boolean;
  onResponsavel: (v: boolean) => void;
  erros: string[];
  enviando: boolean;
  onVoltar: () => void;
  onEnviar: () => void;
};

export default function PassoTermo(props: Props) {
  const { titular, participantes, selecao, turmas, config, erros, enviando } = props;
  const menores = participantes.filter((p) => (idade(parseNasc(p.nascTxt)) ?? 99) < 18);
  const comEscolhas = participantes.filter((p) => (selecao[p.id] || []).length);

  return (
    <>
      <div className="card">
        <h2>Revise antes de enviar</h2>
        <div className="hint">Titular: <b>{titular.nome}</b> · Quadra {titular.quadra} · Lote {titular.lote}</div>
        {comEscolhas.map((p) => (
          <div key={p.id}>
            <b>{p.nome}</b> <span className="hint">({idade(parseNasc(p.nascTxt))} anos)</span>
            {(selecao[p.id] || []).map((id) => {
              const t = turmas.find((x) => x.id === id);
              if (!t) return null;
              return (
                <div className="res" key={id}>
                  <span>{t.nome} <span className="hint">· {diasTxt(t.dias)} {hhmm(t.inicio)}–{hhmm(t.fim)}</span></span>
                  <span className={`chip ${t.vagas_livres > 0 ? "ok" : "warn"}`}>{t.vagas_livres > 0 ? "Vaga disponível agora" : "Lista de espera"}</span>
                </div>
              );
            })}
          </div>
        ))}
        <p className="hint" style={{ margin: 0 }}>
          A situação final de cada turma (confirmada ou lista de espera) é definida no momento do envio, pela ordem de chegada.
        </p>
      </div>

      <div className="card">
        <h2>Termo de consentimento (LGPD)</h2>
        <div className="terms" tabIndex={0}>{config.lgpd_texto}</div>
        <label className="check">
          <input type="checkbox" checked={props.lgpd} onChange={(e) => props.onLgpd(e.target.checked)} />
          <span>Li e concordo com o termo de tratamento de dados pessoais.</span>
        </label>
        {menores.length > 0 && (
          <label className="check">
            <input type="checkbox" checked={props.responsavel} onChange={(e) => props.onResponsavel(e.target.checked)} />
            <span>
              Declaro ser o responsável legal de {menores.map((p) => p.nome.split(" ")[0]).join(", ")} (menor{menores.length > 1 ? "es" : ""} de 18 anos)
              e autorizo o tratamento dos seus dados para esta finalidade.
            </span>
          </label>
        )}
        <ListaErros erros={erros} />
        <div className="foot">
          <button type="button" className="btn" onClick={props.onVoltar} disabled={enviando}>Voltar</button>
          <button type="button" className="btn primary" onClick={props.onEnviar} disabled={enviando}>{enviando ? "Enviando…" : "Enviar inscrição"}</button>
        </div>
      </div>
    </>
  );
}

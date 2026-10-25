"use client";

import { useState } from "react";
import { dataHora, useConfirmacao, type Inscricao, type TurmaResumo } from "@/lib/painel";

export type Solicitacao = {
  id: string; inscricao_id: string; status: "pendente" | "aprovada" | "recusada" | "sem_efeito"; motivo: string;
  frequencia: { pct?: number; faltas?: number; aulas?: number }; solicitado_em: string; decidido_em: string | null; nota_decisao: string;
  participante?: string;
};

type Props = {
  solicitacoes: Solicitacao[];
  inscricoes: Inscricao[];
  turmaPorId: Map<string, TurmaResumo>;
  posicoes: Map<string, number>;
  onDecidir: (s: Solicitacao & { participante: string }, aprovar: boolean, nota: string) => void;
};

const ROTULO = { aprovada: ["ok", "Aprovada"], recusada: ["bad", "Recusada"], sem_efeito: ["", "Sem efeito"], pendente: ["warn", "Pendente"] } as const;

// Pedidos de desligamento por faltas feitos pelos professores, para a coordenação decidir
export default function Solicitacoes({ solicitacoes, inscricoes, turmaPorId, posicoes, onDecidir }: Props) {
  const [notas, setNotas] = useState<Record<string, string>>({});
  const { armado, confirmar } = useConfirmacao(6000);
  const insc = new Map(inscricoes.map((i) => [i.id, i]));
  const pendentes = solicitacoes.filter((s) => s.status === "pendente");
  const decididas = solicitacoes.filter((s) => s.status !== "pendente").sort((a, b) => (b.decidido_em || "").localeCompare(a.decidido_em || "")).slice(0, 5);
  if (!solicitacoes.length) return null;

  // Próximo elegível da fila (quem já tem 2 confirmadas é pulado), igual à regra do banco
  const proximo = (turmaId: string) => {
    const conf = (k: string) => inscricoes.filter((x) => x.pessoa_key === k && x.status === "confirmada").length;
    return inscricoes.filter((x) => x.turma_id === turmaId && x.status === "espera")
      .sort((a, b) => (posicoes.get(a.id) || 0) - (posicoes.get(b.id) || 0)).find((x) => conf(x.pessoa_key) < 2);
  };

  return (
    <div className="card">
      <h2>Solicitações de desligamento</h2>
      {!pendentes.length && <p className="hint" style={{ margin: 0 }}>Nenhuma solicitação aguardando aprovação.</p>}
      {pendentes.map((s) => {
        const i = insc.get(s.inscricao_id), t = i ? turmaPorId.get(i.turma_id) : undefined;
        const ativo = i?.status === "confirmada";
        const prox = i ? proximo(i.turma_id) : undefined;
        const nome = i?.participante_nome ?? "Aluno";
        return (
          <div className="caixa" key={s.id}>
            <div className="caixa-cab">
              <span><b>{nome}</b> <span className="hint">· {t?.codigo} {t?.nome}</span></span>
              <span className="chip warn">Aguardando aprovação</span>
            </div>
            <div className="toolbar">
              {s.frequencia?.pct != null && <><span className="chip bad">{s.frequencia.pct}% presença</span><span className="chip">{s.frequencia.faltas} faltas em {s.frequencia.aulas} aulas</span></>}
              <span className="hint">Pedido em {dataHora(s.solicitado_em)}</span>
            </div>
            <div>{s.motivo}</div>
            {!ativo ? <div className="issue warn">Este aluno não está mais matriculado na turma. A solicitação pode ser arquivada.</div>
              : prox ? <div className="issue ok">Se aprovar, a vaga irá para <b>{prox.participante_nome}</b> ({posicoes.get(prox.id)}ª da lista de espera) e o titular, {prox.titular_nome}, receberá a mensagem de chamamento. O titular de {nome.split(" ")[0]} recebe o aviso de desligamento.</div>
              : <div className="issue warn">Ninguém elegível na lista de espera: a vaga ficará livre. O titular de {nome.split(" ")[0]} recebe o aviso de desligamento.</div>}
            <input className="field" placeholder="Observação da coordenação (opcional)" value={notas[s.id] || ""} onChange={(e) => setNotas({ ...notas, [s.id]: e.target.value })} />
            <div className="toolbar">
              {ativo ? (
                <>
                  <button type="button" className={`btn small danger ${armado === `a${s.id}` ? "armado" : ""}`}
                    onClick={() => confirmar(`a${s.id}`) && onDecidir({ ...s, participante: nome }, true, notas[s.id] || "")}>
                    {armado === `a${s.id}` ? "Confirmar: desligar e chamar o próximo" : "Aprovar desligamento"}
                  </button>
                  <button type="button" className={`btn small ${armado === `r${s.id}` ? "primary" : ""}`}
                    onClick={() => confirmar(`r${s.id}`) && onDecidir({ ...s, participante: nome }, false, notas[s.id] || "")}>
                    {armado === `r${s.id}` ? "Confirmar recusa" : "Recusar"}
                  </button>
                </>
              ) : (
                <button type="button" className="btn small" onClick={() => onDecidir({ ...s, participante: nome }, true, notas[s.id] || "")}>Arquivar</button>
              )}
            </div>
          </div>
        );
      })}
      {decididas.length > 0 && (
        <details>
          <summary className="hint" style={{ cursor: "pointer" }}>Últimas decisões</summary>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {decididas.map((s) => (
              <div className="hint" key={s.id}>
                <span className={`chip ${ROTULO[s.status][0]}`}>{ROTULO[s.status][1]}</span> {insc.get(s.inscricao_id)?.participante_nome} · {dataHora(s.decidido_em)}{s.nota_decisao ? ` · ${s.nota_decisao}` : ""}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

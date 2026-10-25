"use client";

import { useEffect, useState } from "react";
import type { Titular } from "@/lib/regras";
import { normQL } from "@/lib/regras";
import { rotuloStatus } from "@/lib/status";

export type ItemResultado = {
  participante: string;
  turma_id: string;
  codigo: string | null;
  turma: string | null;
  detalhe: string;
  status: "confirmada" | "espera" | "recusada";
  mensagem: string | null;
  posicao: number | null;
};
export type RespostaInscricao = { protocolo: string; token: string; em: string; itens: ItemResultado[] };

export default function Resultado({ resposta, titular, onNova }: { resposta: RespostaInscricao; titular: Titular; onNova: () => void }) {
  const [link, setLink] = useState("");
  const [copiado, setCopiado] = useState(false);
  useEffect(() => setLink(`${window.location.origin}/comprovante/${resposta.token}`), [resposta.token]);
  const pessoas = [...new Set(resposta.itens.map((i) => i.participante))];

  async function copiar() {
    try { await navigator.clipboard.writeText(link); setCopiado(true); } catch { /* o campo continua selecionável */ }
  }

  return (
    <>
      <div className="card">
        <div className="eyebrow">Protocolo</div>
        <div className="proto">{resposta.protocolo}</div>
        <div className="hint">
          Enviado em {new Date(resposta.em).toLocaleString("pt-BR")} · Titular {titular.nome} · Quadra {normQL(titular.quadra)} · Lote {normQL(titular.lote)}
        </div>
      </div>
      {pessoas.map((nome) => (
        <div className="card" key={nome}>
          <h2>{nome}</h2>
          <div>
            {resposta.itens.filter((i) => i.participante === nome).map((i) => {
              const [cls, txt] = rotuloStatus(i.status, i.posicao);
              return (
                <div className="res" key={i.turma_id}>
                  <span>
                    <b>{i.turma ?? "Turma"}</b><br />
                    <span className="hint">{i.codigo} · {i.detalhe}</span>
                    {i.mensagem && <><br /><span className="hint">{i.mensagem}</span></>}
                  </span>
                  <span className={`status ${cls}`}>{txt}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="card">
        <h2>Acompanhe a sua inscrição</h2>
        <p style={{ margin: 0 }}>
          Guarde este link: nele você vê a situação atualizada, inclusive a posição na lista de espera.
          Se uma vaga abrir, você é avisado por e-mail.
        </p>
        <div className="link-copia">
          <input className="field" readOnly value={link} aria-label="Link do comprovante" onFocus={(e) => e.target.select()} />
          <button type="button" className="btn" onClick={copiar}>{copiado ? "Link copiado" : "Copiar link"}</button>
        </div>
        <div className="foot"><a className="btn" href={link}>Abrir comprovante</a><button type="button" className="btn primary" onClick={onNova}>Nova inscrição</button></div>
      </div>
    </>
  );
}

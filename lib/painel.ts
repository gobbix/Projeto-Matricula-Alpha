// Utilidades do painel da equipe
import { useEffect, useState } from "react";
import { conflitam, norm } from "./regras";

export type TurmaCompleta = {
  id: string;
  codigo: string;
  modalidade: string;
  nome: string;
  idade_min: number | null;
  idade_max: number | null;
  faixa_revisar: boolean;
  dias: string[];
  inicio: string;
  fim: string;
  local: string;
  professor: string;
  local_compartilhado: boolean;
  vagas: number;
  ativa: boolean;
  obs: string;
};
export type Ocupacao = { turma_id: string; confirmadas: number; espera: number };

export type Inscricao = {
  id: string; protocolo: string; turma_id: string; status: "confirmada" | "espera" | "cancelada"; pessoa_key: string;
  participante_nome: string; participante_nasc: string; idade_na_inscricao: number; tipo: string; parentesco: string;
  titular_nome: string; quadra: string; lote: string; telefone: string; email: string; origem: string;
  conferido: boolean; criado_em: string; promovido_em: string | null; motivo_cancelamento: string | null; lgpd: { versao?: string };
};
export type TurmaResumo = { id: string; codigo: string; nome: string; modalidade: string; dias: string[]; inicio: string; fim: string; vagas: number };

// Posição de cada inscrição na fila da sua turma
export function posicoesEspera(lista: Inscricao[]): Map<string, number> {
  const pos = new Map<string, number>(), cont = new Map<string, number>();
  [...lista].filter((i) => i.status === "espera").sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.id.localeCompare(b.id))
    .forEach((i) => { const n = (cont.get(i.turma_id) || 0) + 1; cont.set(i.turma_id, n); pos.set(i.id, n); });
  return pos;
}


// "Diogo Aguiar / Sara" -> ["diogo aguiar", "sara"]
export const professores = (p: string) => String(p || "").split("/").map(norm).filter(Boolean);
export const professoresIndividuais = (turmas: { professor: string }[]) =>
  [...new Set(turmas.flatMap((t) => t.professor.split("/").map((x) => x.trim())).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt"));

// Turmas ativas com o mesmo professor ou o mesmo local em horário sobreposto
export function conflitos(turmas: TurmaCompleta[]): Map<string, { outra: TurmaCompleta; motivo: string[] }[]> {
  const res = new Map<string, { outra: TurmaCompleta; motivo: string[] }[]>();
  const ativas = turmas.filter((t) => t.ativa);
  for (let i = 0; i < ativas.length; i++) for (let j = i + 1; j < ativas.length; j++) {
    const a = ativas[i], b = ativas[j];
    if (!conflitam(a, b)) continue;
    const motivo: string[] = [];
    if (professores(a.professor).some((p) => professores(b.professor).includes(p))) motivo.push("professor");
    if (norm(a.local) && norm(a.local) === norm(b.local) && !a.local_compartilhado && !b.local_compartilhado) motivo.push("local");
    if (!motivo.length) continue;
    for (const [x, y] of [[a, b], [b, a]]) res.set(x.id, [...(res.get(x.id) || []), { outra: y, motivo }]);
  }
  return res;
}

// Próximo código livre da modalidade: NAT-15, ou as 3 primeiras letras para modalidade nova
export function proximoCodigo(modalidade: string, turmas: TurmaCompleta[]): string {
  const existente = turmas.find((t) => t.modalidade === modalidade);
  const prefixo = existente ? existente.codigo.split("-")[0] : norm(modalidade).replace(/[^a-z]/g, "").slice(0, 3).toUpperCase() || "TUR";
  const usados = new Set(turmas.map((t) => t.codigo));
  let n = 1;
  while (usados.has(`${prefixo}-${String(n).padStart(2, "0")}`)) n++;
  return `${prefixo}-${String(n).padStart(2, "0")}`;
}

// Gera e baixa uma planilha CSV (separador ";" e BOM para abrir certo no Excel)
export function baixarCsv(nome: string, colunas: string[], linhas: (string | number | null | undefined)[][]) {
  const csv = "﻿" + [colunas, ...linhas].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const dataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
export const dataBR = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

// Botão que pede um segundo clique para confirmar ações destrutivas
export function useConfirmacao(ms = 5000) {
  const [armado, setArmado] = useState<string | null>(null);
  useEffect(() => {
    if (!armado) return;
    const t = setTimeout(() => setArmado(null), ms);
    return () => clearTimeout(t);
  }, [armado, ms]);
  // devolve true quando já estava armado (segundo clique = confirmar)
  const confirmar = (chave: string) => {
    if (armado === chave) { setArmado(null); return true; }
    setArmado(chave); return false;
  };
  return { armado, confirmar };
}

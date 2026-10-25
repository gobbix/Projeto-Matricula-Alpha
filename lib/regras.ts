// Regras usadas no formulário para orientar o associado antes do envio.
// A decisão final (vaga, espera, recusa) é sempre do banco, na função `inscrever`.

export const DIAS = [
  ["seg", "Seg"], ["ter", "Ter"], ["qua", "Qua"], ["qui", "Qui"], ["sex", "Sex"], ["sab", "Sáb"], ["dom", "Dom"],
] as const;
const ORDEM_DIA: Record<string, number> = Object.fromEntries(DIAS.map(([d], i) => [d, i]));

export type Turma = {
  id: string;
  codigo: string;
  modalidade: string;
  nome: string;
  idade_min: number | null;
  idade_max: number | null;
  dias: string[];
  inicio: string; // "16:40:00"
  fim: string;
  local: string;
  professor: string;
  vagas: number;
  vagas_livres: number;
  fila: number;
};

export type Config = {
  periodo: string;
  inscricoes_abertas: boolean;
  max_matriculas: number;
  lgpd_versao: string;
  lgpd_texto: string;
};

export type Titular = { nome: string; quadra: string; lote: string; telefone: string; email: string };
export type Participante = {
  id: string;
  tipo: "titular" | "dependente";
  nome: string;
  nascTxt: string; // DD/MM/AAAA como digitado
  parentesco: string;
};
export type InscricaoExistente = { turma_id: string; status: "confirmada" | "espera" };

export const PARENTESCOS = ["Filho(a)", "Cônjuge", "Neto(a)", "Enteado(a)", "Outro"];

export const norm = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Mesma padronização do banco (normalizar_ql): "q 03" -> "3", "Lote 12a" -> "12A"
export function normQL(s: string): string {
  const v = String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/QUADRA|LOTE|\bQD\b|\bLT\b|^\s*Q|^\s*L/g, "")
    .replace(/[^A-Z0-9]/g, "");
  return v.replace(/^0+(?=\d)/, "");
}

export const hhmm = (t: string) => String(t || "").slice(0, 5);
export const diasTxt = (dias: string[]) =>
  [...dias].sort((a, b) => ORDEM_DIA[a] - ORDEM_DIA[b]).map((d) => DIAS[ORDEM_DIA[d]]?.[1] ?? d).join("/");

export function faixaTxt(t: Pick<Turma, "idade_min" | "idade_max">): string {
  const a = t.idade_min, b = t.idade_max;
  if (a == null && b == null) return "Livre";
  if (b == null) return `${a}+ anos`;
  if (a == null) return `até ${b} anos`;
  return a === b ? `${a} anos` : `${a} a ${b} anos`;
}

// Data local de hoje (o banco usa o fuso de São Paulo)
export function hojeISO(ref = new Date()): string {
  const d = new Date(ref.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function idade(nascISO: string, refISO = hojeISO()): number | null {
  if (!nascISO) return null;
  const [y, m, d] = nascISO.split("-").map(Number);
  const [ry, rm, rd] = refISO.split("-").map(Number);
  let a = ry - y;
  if (rm < m || (rm === m && rd < d)) a--;
  return a;
}

// "DD/MM/AAAA" -> "AAAA-MM-DD"; vazio se inválida, futura ou anterior a 1900
export function parseNasc(s: string, refISO = hojeISO()): string {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  const [, d, mo, y] = m;
  const dt = new Date(Date.UTC(+y, +mo - 1, +d));
  if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return "";
  const iso = `${y}-${mo}-${d}`;
  if (iso > refISO || +y < 1900) return "";
  return iso;
}

// Máscara enquanto digita: "15032018" -> "15/03/2018"
export function mascaraData(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

export const idadeOk = (t: Pick<Turma, "idade_min" | "idade_max">, a: number | null) =>
  a != null && a >= 0 && (t.idade_min == null || a >= t.idade_min) && (t.idade_max == null || a <= t.idade_max);

const min = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export const conflitam = (a: Pick<Turma, "dias" | "inicio" | "fim">, b: Pick<Turma, "dias" | "inicio" | "fim">) =>
  a.dias.some((d) => b.dias.includes(d)) && min(a.inicio) < min(b.fim) && min(b.inicio) < min(a.fim);

export const ordenarTurmas = (a: Turma, b: Turma) =>
  a.modalidade.localeCompare(b.modalidade, "pt")
  || Math.min(...a.dias.map((d) => ORDEM_DIA[d])) - Math.min(...b.dias.map((d) => ORDEM_DIA[d]))
  || min(a.inicio) - min(b.inicio);

const nomeCompleto = (s: string) => norm(s).split(" ").filter(Boolean).length >= 2;

export function validarTitular(t: Titular): string[] {
  const e: string[] = [];
  if (!nomeCompleto(t.nome)) e.push("Informe o nome completo do titular (nome e sobrenome).");
  if (!normQL(t.quadra)) e.push("Informe a quadra.");
  if (!normQL(t.lote)) e.push("Informe o lote.");
  const tel = t.telefone.replace(/\D/g, "");
  if (tel.length < 10 || tel.length > 11) e.push("Informe um celular com DDD (10 ou 11 números).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t.email.trim())) e.push("Informe um e-mail válido.");
  return e;
}

export function validarParticipantes(ps: Participante[], refISO = hojeISO()): string[] {
  const e: string[] = [];
  if (!ps.length) e.push("Adicione pelo menos uma pessoa.");
  for (const p of ps) {
    const n = p.tipo === "titular" ? "Titular" : p.nome || "Dependente";
    if (!nomeCompleto(p.nome)) e.push(`${n}: informe o nome completo.`);
    const a = idade(parseNasc(p.nascTxt, refISO), refISO);
    if (a == null || a < 0 || a > 110) e.push(`${n}: informe uma data de nascimento válida, no formato DD/MM/AAAA.`);
    if (p.tipo === "dependente" && !p.parentesco) e.push(`${n}: selecione o parentesco.`);
  }
  const nomes = ps.map((p) => norm(p.nome));
  if (new Set(nomes).size !== nomes.length) e.push("A mesma pessoa foi adicionada duas vezes.");
  return e;
}

export type EstadoOpcao =
  | { bloqueada: true; motivo: string }
  | { bloqueada: false; temVaga: boolean };

// Situação de uma turma para um participante, considerando o que ele já tem e o que já marcou
export function estadoOpcao(
  t: Turma, selecionadas: Turma[], existentes: (InscricaoExistente & { turma?: Turma })[], maxMatriculas: number,
): EstadoOpcao {
  if (existentes.some((x) => x.turma_id === t.id)) return { bloqueada: true, motivo: "Já inscrito nesta turma." };
  const outras = [...existentes.map((x) => x.turma).filter((x): x is Turma => !!x), ...selecionadas.filter((s) => s.id !== t.id)];
  const c = outras.find((o) => conflitam(o, t));
  if (c) return { bloqueada: true, motivo: `Horário conflita com ${c.nome} (${diasTxt(c.dias)} ${hhmm(c.inicio)}–${hhmm(c.fim)}).` };
  const temVaga = t.vagas_livres > 0;
  const confirmadasPrevistas = existentes.filter((x) => x.status === "confirmada").length
    + selecionadas.filter((s) => s.id !== t.id && s.vagas_livres > 0).length;
  const marcada = selecionadas.some((s) => s.id === t.id);
  if (temVaga && confirmadasPrevistas >= maxMatriculas && !marcada) {
    return { bloqueada: true, motivo: `Limite de ${maxMatriculas} matrículas confirmadas atingido. Esta turma tem vaga, então não é possível entrar na lista de espera dela.` };
  }
  return { bloqueada: false, temVaga };
}

export function previsao(selecionadas: Turma[], existentes: InscricaoExistente[], maxMatriculas: number) {
  let conf = existentes.filter((x) => x.status === "confirmada").length;
  let esp = existentes.filter((x) => x.status === "espera").length;
  for (const t of selecionadas) {
    if (t.vagas_livres > 0 && conf < maxMatriculas) conf++; else esp++;
  }
  return { conf, esp };
}

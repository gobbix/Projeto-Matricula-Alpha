import { describe, expect, it } from "vitest";
import {
  conflitam, estadoOpcao, faixaTxt, idade, idadeOk, mascaraData, normQL, parseNasc, previsao, validarTitular, type Turma,
} from "./regras";

const turma = (p: Partial<Turma>): Turma => ({
  id: "t", codigo: "X-01", modalidade: "Natação", nome: "Turma", idade_min: null, idade_max: null,
  dias: ["seg", "qua"], inicio: "16:40:00", fim: "17:20:00", local: "", professor: "", vagas: 10, vagas_livres: 5, fila: 0, ...p,
});

describe("datas e idade", () => {
  it("lê DD/MM/AAAA e recusa datas impossíveis ou futuras", () => {
    expect(parseNasc("15/03/2018", "2026-10-25")).toBe("2018-03-15");
    expect(parseNasc("29/02/2020", "2026-10-25")).toBe("2020-02-29");
    expect(parseNasc("31/02/2018", "2026-10-25")).toBe("");
    expect(parseNasc("01/01/2030", "2026-10-25")).toBe("");
    expect(parseNasc("5/3/2018", "2026-10-25")).toBe("");
  });
  it("calcula a idade na data de referência", () => {
    expect(idade("2020-10-25", "2026-10-25")).toBe(6);
    expect(idade("2020-10-26", "2026-10-25")).toBe(5);
  });
  it("aplica a máscara enquanto digita", () => {
    expect(mascaraData("15")).toBe("15");
    expect(mascaraData("1503")).toBe("15/03");
    expect(mascaraData("15032018")).toBe("15/03/2018");
  });
});

describe("faixa etária", () => {
  it("respeita os limites inclusivos", () => {
    const t = turma({ idade_min: 5, idade_max: 6 });
    expect([4, 5, 6, 7].map((a) => idadeOk(t, a))).toEqual([false, true, true, false]);
    expect(idadeOk(turma({ idade_min: 16 }), 16)).toBe(true);
    expect(faixaTxt({ idade_min: 16, idade_max: null })).toBe("16+ anos");
  });
});

describe("quadra e lote", () => {
  it("padroniza como o banco", () => {
    expect(normQL("q 03")).toBe("3");
    expect(normQL("Lote 12a")).toBe("12A");
    expect(normQL("QUADRA 7")).toBe("7");
  });
});

describe("seleção de turmas", () => {
  it("detecta conflito de horário", () => {
    expect(conflitam(turma({}), turma({ dias: ["seg"], inicio: "17:00:00", fim: "17:30:00" }))).toBe(true);
    expect(conflitam(turma({}), turma({ dias: ["ter"], inicio: "17:00:00", fim: "17:30:00" }))).toBe(false);
    expect(conflitam(turma({}), turma({ inicio: "17:20:00", fim: "18:00:00" }))).toBe(false);
  });
  it("bloqueia turma com vaga quando já há 2 matrículas previstas, mas permite lista de espera", () => {
    const a = turma({ id: "a", dias: ["seg"] }), b = turma({ id: "b", dias: ["ter"] });
    const comVaga = turma({ id: "c", dias: ["qui"] }), cheia = turma({ id: "d", dias: ["sex"], vagas_livres: 0 });
    expect(estadoOpcao(comVaga, [a, b], [], 2)).toMatchObject({ bloqueada: true });
    expect(estadoOpcao(cheia, [a, b], [], 2)).toEqual({ bloqueada: false, temVaga: false });
    expect(previsao([a, b, cheia], [], 2)).toEqual({ conf: 2, esp: 1 });
  });
  it("bloqueia turma em que a pessoa já está inscrita", () => {
    expect(estadoOpcao(turma({ id: "a" }), [], [{ turma_id: "a", status: "espera" }], 2)).toMatchObject({ bloqueada: true });
  });
  it("valida os dados do titular", () => {
    expect(validarTitular({ nome: "Carlos", quadra: "", lote: "1", telefone: "119", email: "x" })).toHaveLength(4);
    expect(validarTitular({ nome: "Carlos Pereira", quadra: "3", lote: "12", telefone: "(11) 99999-0000", email: "c@e.com" })).toEqual([]);
  });
});

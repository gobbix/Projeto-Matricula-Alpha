// Rótulo e cor da situação de uma inscrição (usado no resultado do envio e no comprovante)
export function rotuloStatus(status: string, posicao: number | null): [string, string] {
  if (status === "confirmada") return ["ok", "Matrícula confirmada"];
  if (status === "espera") return ["warn", `Lista de espera${posicao ? ` · ${posicao}ª posição` : ""}`];
  if (status === "cancelada") return ["bad", "Cancelada"];
  return ["bad", "Não realizada"];
}

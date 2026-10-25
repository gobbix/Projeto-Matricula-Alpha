"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mensagemErro, supabase } from "@/lib/supabase";
import {
  idade, idadeOk, parseNasc, validarParticipantes, validarTitular, normQL,
  type Config, type InscricaoExistente, type Participante, type Titular, type Turma,
} from "@/lib/regras";
import PassoTitular from "./PassoTitular";
import PassoParticipantes from "./PassoParticipantes";
import PassoAtividades from "./PassoAtividades";
import PassoTermo from "./PassoTermo";
import Resultado, { type RespostaInscricao } from "./Resultado";

const PASSOS = ["Associado", "Participantes", "Atividades", "Termo e envio", "Comprovante"];
const TITULAR_VAZIO: Titular = { nome: "", quadra: "", lote: "", telefone: "", email: "" };

// `cliente` é usado no balcão (sessão da equipe); sem ele, a inscrição é anônima (associado)
export default function Inscricao({ config, cliente }: { config: Config; cliente?: SupabaseClient }) {
  const db = useCallback(() => cliente ?? supabase(), [cliente]);
  const [passo, setPasso] = useState(1);
  const [titular, setTitular] = useState<Titular>(TITULAR_VAZIO);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [selecao, setSelecao] = useState<Record<string, string[]>>({});
  const [turmas, setTurmas] = useState<Turma[] | null>(null);
  const [existentes, setExistentes] = useState<Record<string, InscricaoExistente[]>>({});
  const [lgpd, setLgpd] = useState(false);
  const [responsavel, setResponsavel] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState<RespostaInscricao | null>(null);
  const seq = useRef(0);
  const novoId = () => `p${++seq.current}`;

  // ---- catálogo de turmas (vagas livres e fila), atualizado enquanto a pessoa escolhe ----
  const carregarTurmas = useCallback(async () => {
    const { data, error } = await db().from("turmas_publicas").select("*");
    if (error) { setErros([mensagemErro(error)]); return null; }
    setTurmas(data as Turma[]);
    return data as Turma[];
  }, [db]);
  useEffect(() => {
    if (passo !== 3 && passo !== 4) return;
    const id = setInterval(carregarTurmas, 30000);
    return () => clearInterval(id);
  }, [passo, carregarTurmas]);

  async function carregarExistentes() {
    const res: Record<string, InscricaoExistente[]> = {};
    await Promise.all(participantes.map(async (p) => {
      const { data } = await db().rpc("inscricoes_da_pessoa", {
        p_quadra: titular.quadra, p_lote: titular.lote, p_nome: p.nome, p_nasc: parseNasc(p.nascTxt),
      });
      res[p.id] = (data as InscricaoExistente[]) || [];
    }));
    setExistentes(res);
  }

  // Remove escolhas que deixaram de valer (data de nascimento mudou ou turma saiu do catálogo)
  function podar(lista: Turma[] | null): string[] {
    if (!lista) return [];
    const msgs: string[] = [];
    const nova: Record<string, string[]> = {};
    for (const p of participantes) {
      const a = idade(parseNasc(p.nascTxt));
      const primeiro = p.nome.split(" ")[0];
      nova[p.id] = (selecao[p.id] || []).filter((id) => {
        const t = lista.find((x) => x.id === id);
        if (!t) { msgs.push(`Uma turma foi retirada das escolhas de ${primeiro}: ela não está mais disponível.`); return false; }
        if (!idadeOk(t, a)) { msgs.push(`${t.nome} foi retirada das escolhas de ${primeiro}: a turma não é para ${a} anos.`); return false; }
        return true;
      });
    }
    setSelecao(nova);
    return msgs;
  }

  async function irPara(n: number) {
    if (n > passo) {
      if (n >= 2) { const e = validarTitular(titular); if (e.length) { setErros(e); setPasso(1); return; } }
      if (n >= 3) { const e = validarParticipantes(participantes); if (e.length) { setErros(e); setPasso(2); return; } }
      if (n >= 4 && !participantes.some((p) => (selecao[p.id] || []).length)) { setErros(["Escolha pelo menos uma atividade."]); setPasso(3); return; }
    }
    let avisos: string[] = [];
    if (n === 2 && !participantes.length) setParticipantes([{ id: novoId(), tipo: "titular", nome: titular.nome, nascTxt: "", parentesco: "" }]);
    if (n === 3) {
      const lista = await carregarTurmas();
      await carregarExistentes();
      avisos = podar(lista);
    }
    setErros(avisos);
    setPasso(n);
    window.scrollTo({ top: 0 });
  }

  async function enviar() {
    const menores = participantes.filter((p) => (idade(parseNasc(p.nascTxt)) ?? 99) < 18);
    const e: string[] = [];
    if (!lgpd) e.push("Para enviar, é preciso aceitar o termo de tratamento de dados.");
    if (menores.length && !responsavel) e.push("Confirme que você é o responsável legal dos menores de 18 anos.");
    if (e.length) { setErros(e); return; }
    setEnviando(true); setErros([]);
    const { data, error } = await db().rpc("inscrever", {
      payload: {
        titular,
        participantes: participantes
          .filter((p) => (selecao[p.id] || []).length)
          .map((p) => ({ nome: p.nome.trim(), nascimento: parseNasc(p.nascTxt), tipo: p.tipo, parentesco: p.parentesco, turmas: selecao[p.id] })),
        lgpd: { aceito: true, responsavel_legal: responsavel },
      },
    });
    setEnviando(false);
    if (error) { setErros([mensagemErro(error)]); return; }
    setResposta(data as RespostaInscricao);
    setPasso(5);
    window.scrollTo({ top: 0 });
  }

  function recomecar() {
    setTitular(TITULAR_VAZIO); setParticipantes([]); setSelecao({}); setExistentes({});
    setLgpd(false); setResponsavel(false); setErros([]); setResposta(null); setPasso(1);
  }

  return (
    <>
      <ol className="steps" aria-label="Etapas da inscrição">
        {PASSOS.map((s, i) => (
          <li key={s} className={i + 1 < passo ? "done" : i + 1 === passo ? "cur" : ""} aria-current={i + 1 === passo ? "step" : undefined}>{s}</li>
        ))}
      </ol>

      {passo === 1 && <PassoTitular titular={titular} onChange={(t) => {
        setTitular(t);
        setParticipantes((ps) => ps.map((p) => (p.tipo === "titular" ? { ...p, nome: t.nome } : p)));
      }} erros={erros} onAvancar={() => irPara(2)} />}

      {passo === 2 && <PassoParticipantes participantes={participantes} maxMatriculas={config.max_matriculas}
        onChange={setParticipantes} novoId={novoId} titularNome={titular.nome} erros={erros}
        onVoltar={() => irPara(1)} onAvancar={() => irPara(3)} />}

      {passo === 3 && <PassoAtividades participantes={participantes} turmas={turmas} existentes={existentes}
        selecao={selecao} onSelecao={(id, lista) => { setSelecao((s) => ({ ...s, [id]: lista })); setErros([]); }}
        maxMatriculas={config.max_matriculas} erros={erros} onVoltar={() => irPara(2)} onAvancar={() => irPara(4)} />}

      {passo === 4 && <PassoTermo titular={{ ...titular, quadra: normQL(titular.quadra), lote: normQL(titular.lote) }}
        participantes={participantes} selecao={selecao} turmas={turmas || []} config={config}
        lgpd={lgpd} onLgpd={setLgpd} responsavel={responsavel} onResponsavel={setResponsavel}
        erros={erros} enviando={enviando} onVoltar={() => irPara(3)} onEnviar={enviar} />}

      {passo === 5 && resposta && <Resultado resposta={resposta} titular={titular} onNova={recomecar} />}
    </>
  );
}

export function ListaErros({ erros }: { erros: string[] }) {
  if (!erros.length) return null;
  return (
    <div style={{ display: "grid", gap: 6 }} role="alert">
      {erros.map((e) => <div key={e} className="issue bad">{e}</div>)}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { usePainel } from "@/components/painel/Painel";
import Mensagens, { type Mensagem } from "@/components/painel/Mensagens";
import Solicitacoes, { type Solicitacao } from "@/components/painel/Solicitacoes";
import { diasTxt, hhmm, norm } from "@/lib/regras";
import { baixarCsv, dataBR, dataHora, posicoesEspera, useConfirmacao, type Inscricao, type Ocupacao, type TurmaResumo } from "@/lib/painel";

type Config = { periodo: string; inscricoes_abertas: boolean; msg_chamamento: string; msg_desligamento: string; lgpd_versao: string; lgpd_texto: string };
import { mensagemErro } from "@/lib/supabase";

export default function Inscricoes() {
  const { cliente, pode, usuario } = usePainel();
  const gerenciar = pode("inscricoes.gerenciar");
  const [config, setConfig] = useState<Config | null>(null);
  const [inscricoes, setInscricoes] = useState<Inscricao[]>([]);
  const [turmas, setTurmas] = useState<TurmaResumo[]>([]);
  const [ocupacao, setOcupacao] = useState<Map<string, Ocupacao>>(new Map());
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [busca, setBusca] = useState("");
  const [turmaF, setTurmaF] = useState("");
  const [statusF, setStatusF] = useState("");
  const { armado, confirmar } = useConfirmacao();

  const carregar = useCallback(async () => {
    const [c, i, t, o, s, m] = await Promise.all([
      cliente.from("config").select("periodo, inscricoes_abertas, msg_chamamento, msg_desligamento, lgpd_versao, lgpd_texto").single(),
      pode("inscricoes.ver") || pode("desligamento.aprovar") ? cliente.from("inscricoes").select("*").order("criado_em") : Promise.resolve({ data: [] }),
      cliente.from("turmas").select("id, codigo, nome, modalidade, dias, inicio, fim, vagas").order("codigo"),
      cliente.from("ocupacao").select("*"),
      pode("desligamento.aprovar") ? cliente.from("solicitacoes").select("*").order("solicitado_em") : Promise.resolve({ data: [] }),
      pode("mensagens.enviar") ? cliente.from("mensagens").select("*").order("criado_em", { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
    ]);
    if (c.data) setConfig(c.data as Config);
    setInscricoes((i.data as Inscricao[]) || []);
    setTurmas((t.data as TurmaResumo[]) || []);
    setOcupacao(new Map(((o.data as Ocupacao[]) || []).map((x) => [x.turma_id, x])));
    setSolicitacoes((s.data as Solicitacao[]) || []);
    setMensagens((m.data as Mensagem[]) || []);
    setCarregado(true);
  }, [cliente, pode]);
  useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!carregado) return <div className="empty">Carregando…</div>;
  const turmaPorId = new Map(turmas.map((t) => [t.id, t]));
  const posicoes = posicoesEspera(inscricoes);

  async function salvarConfig(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await cliente.from("config").update(config!).eq("id", true);
    if (error) return setErro(mensagemErro(error));
    setErro(""); setAviso("Configuração salva.");
  }
  async function rpc(nome: string, args: Record<string, unknown>, sucesso: (d: unknown) => string) {
    const { data, error } = await cliente.rpc(nome, args);
    if (error) { setErro(mensagemErro(error)); return; }
    setErro(""); setAviso(sucesso(data)); carregar();
  }
  const chamados = (d: unknown) => {
    const l = (d as Inscricao[]) || [];
    return l.length ? ` ${l.map((x) => x.participante_nome).join(", ")} chamado(a) da lista de espera; mensagem pronta para o titular.` : "";
  };

  const filtradas = inscricoes.filter((i) => {
    if (turmaF && i.turma_id !== turmaF) return false;
    if (statusF === "naoconf") { if (i.conferido || i.status === "cancelada") return false; } else if (statusF && i.status !== statusF) return false;
    if (busca && !norm([i.participante_nome, i.titular_nome, `q${i.quadra}`, `l${i.lote}`, `${i.quadra}-${i.lote}`, i.protocolo, turmaPorId.get(i.turma_id)?.codigo].join(" ")).includes(norm(busca))) return false;
    return true;
  });
  const tSel = turmaF ? turmaPorId.get(turmaF) : undefined;
  const oSel = turmaF ? ocupacao.get(turmaF) : undefined;
  const livres = tSel ? tSel.vagas - (oSel?.confirmadas ?? 0) : 0;

  function exportar() {
    baixarCsv("inscricoes-alphaville.csv",
      ["Protocolo", "Enviada em", "Origem", "Quadra", "Lote", "Titular", "Telefone", "E-mail", "Participante", "Tipo", "Parentesco", "Nascimento", "Idade",
        "Código turma", "Turma", "Modalidade", "Situação", "Posição espera", "LGPD versão", "Conferido"],
      filtradas.map((i) => {
        const t = turmaPorId.get(i.turma_id);
        return [i.protocolo, dataHora(i.criado_em), i.origem, i.quadra, i.lote, i.titular_nome, i.telefone, i.email, i.participante_nome, i.tipo, i.parentesco,
          dataBR(i.participante_nasc), i.idade_na_inscricao, t?.codigo, t?.nome, t?.modalidade, i.status, posicoes.get(i.id) ?? "", i.lgpd?.versao, i.conferido ? "sim" : "não"];
      }));
  }

  return (
    <>
      {erro && <div className="issue bad" role="alert">{erro}</div>}
      {aviso && <div className="issue ok" role="status">{aviso}</div>}

      {pode("config.periodo") && config && (
        <form className="card" onSubmit={salvarConfig}>
          <h2>Período de inscrição</h2>
          <div className="toolbar">
            <label className="f" style={{ width: 140 }}>Período<input className="field" value={config.periodo} onChange={(e) => setConfig({ ...config, periodo: e.target.value })} placeholder="2027/1" /></label>
            <label className="check"><input type="checkbox" checked={config.inscricoes_abertas} onChange={(e) => setConfig({ ...config, inscricoes_abertas: e.target.checked })} /> Inscrições abertas para associados</label>
          </div>
          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Textos das mensagens e termo LGPD</summary>
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
              <label className="f">Mensagem de chamamento da lista de espera<textarea className="field" rows={4} value={config.msg_chamamento} onChange={(e) => setConfig({ ...config, msg_chamamento: e.target.value })} /></label>
              <label className="f">Mensagem de desligamento por faltas<textarea className="field" rows={4} value={config.msg_desligamento} onChange={(e) => setConfig({ ...config, msg_desligamento: e.target.value })} /></label>
              <span className="hint">Campos automáticos: {"{titular} {participante} {turma} {dias} {horario} {local} {professor} {periodo}"}</span>
              <div className="grid2">
                <label className="f">Versão do termo LGPD<input className="field" value={config.lgpd_versao} onChange={(e) => setConfig({ ...config, lgpd_versao: e.target.value })} /></label>
              </div>
              <label className="f">Texto do termo LGPD<textarea className="field" rows={8} value={config.lgpd_texto} onChange={(e) => setConfig({ ...config, lgpd_texto: e.target.value })} /></label>
              <span className="hint">Ao mudar o texto do termo, mude também a versão: cada inscrição registra a versão aceita.</span>
            </div>
          </details>
          <div><button type="submit" className="btn primary">Salvar configuração</button></div>
        </form>
      )}

      {pode("desligamento.aprovar") && (
        <Solicitacoes solicitacoes={solicitacoes} inscricoes={inscricoes} turmaPorId={turmaPorId} posicoes={posicoes}
          onDecidir={(s, aprovar, nota) => rpc("decidir_solicitacao", { p_solicitacao: s.id, p_aprovar: aprovar, p_nota: nota },
            (d) => aprovar ? `${s.participante} desligado(a).${chamados(d)}` : `Solicitação recusada. ${s.participante} continua na turma.`)} />
      )}

      {pode("mensagens.enviar") && <Mensagens mensagens={mensagens} cliente={cliente} usuarioId={usuario.id} onMudou={carregar} />}

      {pode("inscricoes.ver") && (
        <>
          <div className="toolbar">
            <input type="search" className="field" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, quadra, lote ou protocolo" aria-label="Buscar inscrições" />
            <select className="field" value={turmaF} onChange={(e) => setTurmaF(e.target.value)} aria-label="Turma">
              <option value="">Todas as turmas</option>
              {turmas.map((t) => { const o = ocupacao.get(t.id); return <option key={t.id} value={t.id}>{`${t.codigo} · ${t.nome} (${diasTxt(t.dias)} ${hhmm(t.inicio)}) · ${o?.confirmadas ?? 0}/${t.vagas}${o?.espera ? ` +${o.espera} espera` : ""}`}</option>; })}
            </select>
            <select className="field" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Situação">
              <option value="">Todas as situações</option><option value="confirmada">Confirmadas</option><option value="espera">Lista de espera</option>
              <option value="cancelada">Canceladas</option><option value="naoconf">Não conferidas</option>
            </select>
            {gerenciar && <button type="button" className="btn" onClick={exportar}>Exportar planilha</button>}
          </div>
          {gerenciar && tSel && livres > 0 && (oSel?.espera ?? 0) > 0 && (
            <div className="chama">
              {livres} {livres === 1 ? "vaga livre" : "vagas livres"} e {oSel!.espera} na lista de espera.
              <button type="button" className="btn small" onClick={() => rpc("chamar_lista_espera", { p_turma: tSel.id }, (d) => `Lista de espera chamada.${chamados(d)}`)}>Chamar da lista de espera</button>
            </div>
          )}
          {!inscricoes.length ? <div className="empty">Nenhuma inscrição recebida ainda.</div>
            : !filtradas.length ? <div className="empty">Nenhuma inscrição corresponde aos filtros.</div> : (
            <div className="tabela">
              <table style={{ minWidth: 900 }}>
                <thead><tr><th>Enviada em</th><th>Participante</th><th>Titular · Q/L</th><th>Turma</th><th>Situação</th><th>Conferido</th><th /></tr></thead>
                <tbody>
                  {filtradas.map((i) => {
                    const t = turmaPorId.get(i.turma_id);
                    return (
                      <tr key={i.id} className={i.status === "cancelada" ? "cancelada" : ""}>
                        <td className="n">{dataHora(i.criado_em)}<br /><span className="hint">{i.protocolo} · {i.origem === "balcao" ? "balcão" : "online"}</span></td>
                        <td><b>{i.participante_nome}</b><br /><span className="hint">{i.tipo === "titular" ? "Titular" : i.parentesco || "Dependente"} · {dataBR(i.participante_nasc)} ({i.idade_na_inscricao} anos)</span></td>
                        <td>{i.titular_nome}<br /><span className="hint">Quadra {i.quadra} · Lote {i.lote}</span></td>
                        <td><span className="codigo">{t?.codigo}</span> {t?.nome}</td>
                        <td>
                          {i.status === "confirmada" ? <span className="chip ok">Confirmada</span>
                            : i.status === "espera" ? <span className="chip warn">Espera · {posicoes.get(i.id)}ª</span>
                            : <span className="chip">Cancelada</span>}
                          {i.promovido_em && <><br /><span className="hint">chamada da espera</span></>}
                          {i.motivo_cancelamento && <><br /><span className="hint">{i.motivo_cancelamento === "faltas" ? "desligada por faltas" : i.motivo_cancelamento}</span></>}
                        </td>
                        <td>{i.status !== "cancelada" && (
                          <label className="check hint"><input type="checkbox" checked={i.conferido} disabled={!gerenciar} aria-label={`Lançado no sistema do clube: ${i.participante_nome}`}
                            onChange={async (e) => {
                              const v = e.target.checked;
                              setInscricoes((l) => l.map((x) => (x.id === i.id ? { ...x, conferido: v } : x)));
                              const { error } = await cliente.from("inscricoes").update({ conferido: v }).eq("id", i.id);
                              if (error) setErro(mensagemErro(error));
                            }} /> lançado</label>
                        )}</td>
                        <td>{gerenciar && i.status !== "cancelada" && (
                          <button type="button" className={`btn small danger ${armado === i.id ? "armado" : ""}`}
                            onClick={() => confirmar(i.id) && rpc("cancelar_inscricao", { p_inscricao: i.id, p_motivo: "cancelada pela secretaria" },
                              (d) => `Inscrição de ${i.participante_nome} cancelada.${chamados(d)}`)}>
                            {armado === i.id ? "Confirmar" : "Cancelar"}
                          </button>
                        )}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

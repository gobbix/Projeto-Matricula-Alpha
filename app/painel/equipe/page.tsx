"use client";

import { useCallback, useEffect, useState } from "react";
import { usePainel } from "@/components/painel/Painel";
import { PERMISSOES } from "@/lib/permissoes";
import { dataHora, professoresIndividuais, useConfirmacao } from "@/lib/painel";
import { norm } from "@/lib/regras";
import { mensagemErro } from "@/lib/supabase";

type Perfil = { id: string; nome: string; fixo: boolean; ordem: number; permissoes: string[] };
type Membro = { user_id: string; nome: string; email: string; perfil_id: string; professor_nome: string; ativo: boolean; aprovado_em: string };
type Pedido = { user_id: string; nome: string; email: string; perfil_id: string; professor_nome: string; pedido_em: string };

export default function Equipe() {
  const { cliente, usuario } = usePainel();
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [profs, setProfs] = useState<string[]>([]);
  const [escolha, setEscolha] = useState<Record<string, { perfil: string; professor: string }>>({});
  const [novoPerfil, setNovoPerfil] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [carregado, setCarregado] = useState(false);
  const { armado, confirmar } = useConfirmacao();

  const carregar = useCallback(async () => {
    const [pf, m, pd, t] = await Promise.all([
      cliente.from("perfis").select("*").order("ordem"),
      cliente.from("equipe").select("*").order("nome"),
      cliente.from("pedidos_acesso").select("*").order("pedido_em"),
      cliente.from("turmas").select("professor"),
    ]);
    setPerfis((pf.data as Perfil[]) || []);
    setMembros((m.data as Membro[]) || []);
    setPedidos((pd.data as Pedido[]) || []);
    setProfs(professoresIndividuais((t.data as { professor: string }[]) || []));
    setCarregado(true);
  }, [cliente]);
  useEffect(() => { carregar(); }, [carregar]);

  async function acao(p: PromiseLike<{ error: unknown }>, ok: string) {
    const { error } = await p;
    if (error) { setErro(mensagemErro(error)); setAviso(""); } else { setErro(""); setAviso(ok); }
    carregar();
  }
  if (!carregado) return <div className="empty">Carregando…</div>;
  const nomePerfil = (id: string) => perfis.find((p) => p.id === id)?.nome ?? "(perfil excluído)";
  const SelPerfil = ({ valor, onMudar, rotulo }: { valor: string; onMudar: (v: string) => void; rotulo: string }) => (
    <select className="field" value={valor} onChange={(e) => onMudar(e.target.value)} aria-label={rotulo}>
      {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
    </select>
  );

  function alternar(p: Perfil, perm: string, marcado: boolean) {
    const lista = marcado ? [...new Set([...p.permissoes, perm])] : p.permissoes.filter((x) => x !== perm);
    setPerfis((ps) => ps.map((x) => (x.id === p.id ? { ...x, permissoes: lista } : x)));
    acao(cliente.from("perfis").update({ permissoes: lista }).eq("id", p.id), `Permissões de ${p.nome} salvas.`);
  }
  function criarPerfil() {
    const nome = novoPerfil.trim();
    if (!nome) return;
    if (perfis.some((p) => norm(p.nome) === norm(nome))) return setErro("Já existe um perfil com esse nome.");
    const id = norm(nome).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || `perfil-${Date.now()}`;
    setNovoPerfil("");
    acao(cliente.from("perfis").insert({ id, nome, ordem: perfis.length, permissoes: [] }), `Perfil ${nome} criado. Marque as permissões dele na tabela.`);
  }

  let area = "";
  return (
    <>
      {erro && <div className="issue bad" role="alert">{erro}</div>}
      {aviso && <div className="issue ok" role="status">{aviso}</div>}
      <datalist id="dl-profs">{profs.map((p) => <option key={p} value={p} />)}</datalist>

      {pedidos.length > 0 && (
        <div className="card">
          <h2>Pedidos de acesso</h2>
          {pedidos.map((p) => {
            const e = escolha[p.user_id] ?? { perfil: p.perfil_id, professor: p.professor_nome };
            const setE = (x: Partial<typeof e>) => setEscolha({ ...escolha, [p.user_id]: { ...e, ...x } });
            return (
              <div className="caixa" key={p.user_id}>
                <div className="caixa-cab">
                  <span><b>{p.nome}</b> <span className="hint">· {p.email} · pedido em {dataHora(p.pedido_em)}</span></span>
                  <span className="chip warn">Aguardando</span>
                </div>
                <div className="grid2">
                  <label className="f">Perfil<SelPerfil valor={e.perfil} onMudar={(v) => setE({ perfil: v })} rotulo={`Perfil de ${p.nome}`} /></label>
                  <label className="f">Professor vinculado (para a chamada)
                    <input className="field" list="dl-profs" value={e.professor} onChange={(x) => setE({ professor: x.target.value })} placeholder="Só para professores" />
                  </label>
                </div>
                <div className="toolbar">
                  <button type="button" className="btn small primary" onClick={() => acao(cliente.rpc("aprovar_pedido", { p_user: p.user_id, p_perfil: e.perfil, p_professor: e.professor.trim() }), `${p.nome} agora faz parte da equipe como ${nomePerfil(e.perfil)}.`)}>Aprovar acesso</button>
                  <button type="button" className={`btn small danger ${armado === `r${p.user_id}` ? "armado" : ""}`}
                    onClick={() => confirmar(`r${p.user_id}`) && acao(cliente.from("pedidos_acesso").delete().eq("user_id", p.user_id), "Pedido recusado.")}>
                    {armado === `r${p.user_id}` ? "Confirmar recusa" : "Recusar"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <h2>Equipe</h2>
        {!membros.length ? (
          <p className="hint" style={{ margin: 0 }}>Ninguém na equipe ainda. Cada pessoa cria a conta em /painel e pede acesso; os pedidos aparecem aqui.</p>
        ) : (
          <div className="tabela">
            <table style={{ minWidth: 720 }}>
              <thead><tr><th>Pessoa</th><th>Perfil</th><th>Professor vinculado</th><th>Desde</th><th /></tr></thead>
              <tbody>
                {membros.map((m) => (
                  <tr key={m.user_id}>
                    <td><b>{m.nome}</b>{m.user_id === usuario.id && <span className="hint"> (você)</span>}<br /><span className="hint">{m.email}</span></td>
                    <td><SelPerfil valor={m.perfil_id} rotulo={`Perfil de ${m.nome}`} onMudar={(v) => acao(cliente.from("equipe").update({ perfil_id: v }).eq("user_id", m.user_id), `${m.nome} agora é ${nomePerfil(v)}.`)} /></td>
                    <td><input className="field" list="dl-profs" defaultValue={m.professor_nome} placeholder="—" aria-label={`Professor vinculado a ${m.nome}`}
                      onBlur={(e) => e.target.value.trim() !== m.professor_nome && acao(cliente.from("equipe").update({ professor_nome: e.target.value.trim() }).eq("user_id", m.user_id), "Vínculo de professor salvo.")} /></td>
                    <td className="n">{dataHora(m.aprovado_em).slice(0, 10)}</td>
                    <td>
                      <button type="button" className={`btn small danger ${armado === `m${m.user_id}` ? "armado" : ""}`}
                        onClick={() => confirmar(`m${m.user_id}`) && acao(cliente.from("equipe").delete().eq("user_id", m.user_id), `${m.nome} foi removido(a) da equipe.`)}>
                        {armado === `m${m.user_id}` ? (m.user_id === usuario.id ? "Confirmar (você perderá o acesso)" : "Confirmar remoção") : "Remover"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Perfis e permissões</h2>
        <p className="hint" style={{ margin: 0 }}>Marque o que cada perfil pode fazer. Vale na hora para todas as pessoas do perfil. O Coordenador sempre tem acesso total.</p>
        <div className="tabela">
          <table style={{ minWidth: 360 + perfis.length * 120 }}>
            <thead>
              <tr>
                <th>Permissão</th>
                {perfis.map((p) => {
                  const usado = membros.some((m) => m.perfil_id === p.id);
                  return (
                    <th key={p.id} style={{ textAlign: "center" }}>{p.nome}
                      {!p.fixo && !usado && <><br /><button type="button" className={`btn small danger ${armado === `p${p.id}` ? "armado" : ""}`} style={{ marginTop: 4 }}
                        onClick={() => confirmar(`p${p.id}`) && acao(cliente.from("perfis").delete().eq("id", p.id), `Perfil ${p.nome} excluído.`)}>{armado === `p${p.id}` ? "Confirmar" : "Excluir"}</button></>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {PERMISSOES.flatMap(([k, ar, desc]) => {
                const linhas = [];
                if (ar !== area) { area = ar; linhas.push(<tr key={`a-${ar}`}><td className="sep" colSpan={perfis.length + 1}>{ar}</td></tr>); }
                linhas.push(
                  <tr key={k}>
                    <td>{desc}</td>
                    {perfis.map((p) => (
                      <td key={p.id} style={{ textAlign: "center" }}>
                        <input type="checkbox" style={{ width: 18, height: 18 }} checked={p.fixo || p.permissoes.includes(k)} disabled={p.fixo}
                          aria-label={`${p.nome}: ${desc}`} onChange={(e) => alternar(p, k, e.target.checked)} />
                      </td>
                    ))}
                  </tr>,
                );
                return linhas;
              })}
            </tbody>
          </table>
        </div>
        <div className="toolbar">
          <input className="field" value={novoPerfil} onChange={(e) => setNovoPerfil(e.target.value)} placeholder="Nome do novo perfil (ex.: Estagiário)" style={{ maxWidth: 280 }} aria-label="Nome do novo perfil" />
          <button type="button" className="btn" onClick={criarPerfil}>+ Criar perfil</button>
        </div>
      </div>
    </>
  );
}

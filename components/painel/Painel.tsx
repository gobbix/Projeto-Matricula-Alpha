"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { mensagemErro, supabaseNavegador } from "@/lib/supabase";
import { ABAS, type MinhasPermissoes, type Permissao } from "@/lib/permissoes";
import Entrar from "./Entrar";
import PedidoAcesso from "./PedidoAcesso";

type Contexto = {
  cliente: SupabaseClient;
  usuario: User;
  perms: MinhasPermissoes;
  pode: (p: Permissao) => boolean;
};
const PainelContexto = createContext<Contexto | null>(null);

export function usePainel(): Contexto {
  const c = useContext(PainelContexto);
  if (!c) throw new Error("usePainel fora do painel");
  return c;
}

export default function Painel({ children }: { children: React.ReactNode }) {
  const [cliente, setCliente] = useState<SupabaseClient | null>(null);
  const [usuario, setUsuario] = useState<User | null | undefined>(undefined); // undefined = carregando
  const [perms, setPerms] = useState<MinhasPermissoes | null>(null);
  const [erro, setErro] = useState("");
  const caminho = usePathname();
  const router = useRouter();

  const carregarPerms = useCallback(async (c: SupabaseClient) => {
    const { data, error } = await c.rpc("minhas_permissoes");
    if (error) { setErro(mensagemErro(error)); return; }
    setPerms(data as MinhasPermissoes);
  }, []);

  useEffect(() => {
    const c = supabaseNavegador();
    setCliente(c);
    c.auth.getSession().then(({ data }) => setUsuario(data.session?.user ?? null));
    const { data: sub } = c.auth.onAuthStateChange((_e, s) => setUsuario(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (cliente && usuario) carregarPerms(cliente);
    if (!usuario) setPerms(null);
  }, [cliente, usuario, carregarPerms]);

  const lista = new Set(perms?.permissoes ?? []);
  const pode = (p: Permissao) => lista.has(p);
  const abas = ABAS.filter((a) => a.libera.some((p) => lista.has(p)));

  // /painel leva para a primeira aba liberada
  useEffect(() => {
    if (perms?.membro && caminho === "/painel" && abas.length) router.replace(abas[0].href);
  }, [perms, caminho, abas, router]);

  if (erro) return <div className="painel"><div className="issue bad">{erro}</div></div>;
  if (!cliente || usuario === undefined) return <div className="painel"><div className="empty">Carregando…</div></div>;
  if (!usuario) return <div className="painel"><Entrar cliente={cliente} /></div>;
  if (!perms) return <div className="painel"><div className="empty">Carregando permissões…</div></div>;

  const sair = () => cliente.auth.signOut();
  const topo = (
    <div className="painel-topo">
      <div>
        <div className="eyebrow">Painel da equipe</div>
        <h1>{abas.find((a) => caminho.startsWith(a.href))?.nome ?? "Painel"}</h1>
      </div>
      <div className="quem">
        <div><b>{perms.nome ?? usuario.email}</b>{perms.perfil ? ` · ${perms.perfil}` : ""}</div>
        <button type="button" className="btn small" onClick={sair}>Sair</button>
      </div>
    </div>
  );

  if (!perms.membro) {
    return <div className="painel">{topo}<PedidoAcesso cliente={cliente} usuario={usuario} /></div>;
  }

  const atual = abas.find((a) => caminho.startsWith(a.href));
  return (
    <PainelContexto.Provider value={{ cliente, usuario, perms, pode }}>
      <div className="painel">
        {topo}
        {abas.length > 1 && (
          <nav className="abas" aria-label="Seções do painel">
            {abas.map((a) => <Link key={a.href} href={a.href} aria-current={a === atual ? "page" : undefined}>{a.nome}</Link>)}
          </nav>
        )}
        {caminho === "/painel" ? <div className="empty">Abrindo…</div>
          : atual ? children
          : <div className="empty">Você não tem acesso a esta seção. Use as abas acima.</div>}
      </div>
    </PainelContexto.Provider>
  );
}

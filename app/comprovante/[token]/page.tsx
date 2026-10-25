import Link from "next/link";
import { rotuloStatus } from "@/lib/status";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comprovante de inscrição · Alphaville Clube", robots: { index: false } };

type Linha = { protocolo: string; participante: string; codigo: string; turma: string; detalhe: string; status: string; posicao: number | null; criado_em: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Comprovante({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data, error } = UUID.test(token)
    ? await supabase().rpc("consultar_inscricao", { p_token: token })
    : { data: [], error: null };
  const linhas = (data as Linha[] | null) || [];

  if (error) return <div className="empty">Não foi possível consultar agora. Tente novamente em alguns minutos.</div>;
  if (!linhas.length) {
    return (
      <div className="card">
        <h2>Comprovante não encontrado</h2>
        <p style={{ margin: 0 }}>Confira se o link está completo. Em caso de dúvida, procure a secretaria do clube com o número do protocolo.</p>
        <div><Link className="btn" href="/">Ir para a inscrição</Link></div>
      </div>
    );
  }
  const pessoas = [...new Set(linhas.map((l) => l.participante))];

  return (
    <>
      <div>
        <div className="eyebrow">Comprovante de inscrição</div>
        <h1 className="proto" style={{ margin: 0 }}>{linhas[0].protocolo}</h1>
        <div className="hint">Enviado em {new Date(linhas[0].criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · situação atualizada agora</div>
      </div>
      {pessoas.map((nome) => (
        <div className="card" key={nome}>
          <h2>{nome}</h2>
          <div>
            {linhas.filter((l) => l.participante === nome).map((l) => {
              const [cls, txt] = rotuloStatus(l.status, l.posicao);
              return (
                <div className="res" key={l.codigo}>
                  <span><b>{l.turma}</b><br /><span className="hint">{l.codigo} · {l.detalhe}</span></span>
                  <span className={`status ${cls}`}>{txt}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p className="hint">Quem está na lista de espera é chamado na ordem da fila e avisado por e-mail. Recarregue esta página para ver a posição atualizada.</p>
    </>
  );
}

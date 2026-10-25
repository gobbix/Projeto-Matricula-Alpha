import Inscricao from "@/components/inscricao/Inscricao";
import { supabase } from "@/lib/supabase";
import type { Config } from "@/lib/regras";

// Sempre busca a configuração atual (inscrições abertas, período, termo LGPD)
export const dynamic = "force-dynamic";

export default async function Pagina() {
  const { data, error } = await supabase()
    .from("config")
    .select("periodo, inscricoes_abertas, max_matriculas, lgpd_versao, lgpd_texto")
    .single();

  if (error || !data) {
    return (
      <div className="empty">O sistema de inscrições está temporariamente indisponível. Tente novamente em alguns minutos.</div>
    );
  }
  const config = data as Config;

  return (
    <>
      <div>
        <div className="eyebrow">{config.periodo ? `Período ${config.periodo}` : "Inscrições"}</div>
        <h1>Inscrição em atividades</h1>
      </div>
      {config.inscricoes_abertas ? (
        <Inscricao config={config} />
      ) : (
        <div className="card">
          <h2>Inscrições fechadas</h2>
          <p style={{ margin: 0 }}>
            As inscrições {config.periodo ? `do período ${config.periodo} ` : ""}não estão abertas no momento.
            Acompanhe os comunicados do clube para saber a data de abertura.
          </p>
        </div>
      )}
    </>
  );
}

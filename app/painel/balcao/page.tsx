"use client";

import { useEffect, useState } from "react";
import Inscricao from "@/components/inscricao/Inscricao";
import { usePainel } from "@/components/painel/Painel";
import type { Config } from "@/lib/regras";

// Atendimento presencial: mesma inscrição do associado, feita pela equipe (fica marcada como "balcão")
export default function Balcao() {
  const { cliente } = usePainel();
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => {
    cliente.from("config").select("periodo, inscricoes_abertas, max_matriculas, lgpd_versao, lgpd_texto").single()
      .then(({ data }) => setConfig(data as Config));
  }, [cliente]);
  if (!config) return <div className="empty">Carregando…</div>;
  return (
    <div style={{ maxWidth: 760, width: "100%", display: "grid", gap: 16 }}>
      <div className={`issue ${config.inscricoes_abertas ? "ok" : "warn"}`}>
        Atendimento no balcão: a inscrição fica registrada como feita pela equipe.
        {!config.inscricoes_abertas && " As inscrições estão fechadas para os associados, mas a equipe consegue inscrever."}
        {" "}Confirme os dados com o titular e leia o termo LGPD com ele antes de marcar o aceite.
      </div>
      <Inscricao config={config} cliente={cliente} />
    </div>
  );
}

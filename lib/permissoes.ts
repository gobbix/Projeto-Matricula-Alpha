// Permissões que um perfil pode ter (as mesmas checadas pelo banco em tem_permissao)
export const PERMISSOES = [
  ["turmas.ver", "Turmas", "Ver a aba Turmas"],
  ["turmas.editar", "Turmas", "Criar, editar e excluir turmas; definir vagas"],
  ["inscricoes.ver", "Inscrições", "Ver as inscrições e os dados dos inscritos"],
  ["inscricoes.gerenciar", "Inscrições", "Cancelar, conferir, chamar da lista de espera e exportar"],
  ["inscricoes.balcao", "Inscrições", "Inscrever no balcão, mesmo com as inscrições fechadas"],
  ["config.periodo", "Inscrições", "Abrir e fechar inscrições; editar os textos das mensagens"],
  ["mensagens.enviar", "Mensagens", "Enviar e marcar mensagens aos titulares"],
  ["chamada.fazer", "Chamada", "Fazer a chamada das próprias turmas"],
  ["chamada.todas", "Chamada", "Ver e fazer a chamada de todas as turmas"],
  ["desligamento.solicitar", "Desligamento", "Solicitar desligamento por faltas"],
  ["desligamento.aprovar", "Desligamento", "Aprovar ou recusar desligamentos (e desligar direto)"],
  ["equipe.gerenciar", "Equipe", "Gerenciar equipe, perfis e permissões"],
] as const;
export type Permissao = (typeof PERMISSOES)[number][0];

export type MinhasPermissoes = {
  membro: boolean;
  nome: string | null;
  perfil: string | null;
  professor_nome: string | null;
  permissoes: string[] | null;
};

// Abas do painel e a permissão que libera cada uma
export const ABAS = [
  { href: "/painel/turmas", nome: "Turmas", libera: ["turmas.ver", "turmas.editar"] },
  { href: "/painel/inscricoes", nome: "Inscrições", libera: ["inscricoes.ver", "desligamento.aprovar", "mensagens.enviar", "config.periodo"] },
  { href: "/painel/balcao", nome: "Balcão", libera: ["inscricoes.balcao"] },
  { href: "/painel/chamada", nome: "Chamada", libera: ["chamada.fazer", "chamada.todas"] },
  { href: "/painel/equipe", nome: "Equipe", libera: ["equipe.gerenciar"] },
] as const;

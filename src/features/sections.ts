export const sections = {
  atletas: { title: "Buscar atleta", description: "Localize um atleta ao qual seu perfil tem acesso." },
  evolucoes: { title: "Nova evolução", description: "O editor estará disponível com o módulo de evoluções." },
  prontuarios: { title: "Prontuários", description: "Abra o perfil do atleta para consultar seu histórico autorizado." },
  auditoria: { title: "Auditoria", description: "Os eventos serão exibidos quando as operações auditadas estiverem disponíveis." },
} as const;

export function availableSections(canReadAudit: boolean) {
  return Object.entries(sections).filter(([slug]) => slug !== "auditoria" || canReadAudit);
}

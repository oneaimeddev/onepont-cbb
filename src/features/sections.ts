export const sections = {
  atletas: { title: "Buscar atleta", description: "Localize um atleta ao qual seu perfil tem acesso.", isAvailable: true },
  evolucoes: { title: "Nova evolução", description: "O editor estará disponível com o módulo de evoluções.", isAvailable: false },
  prontuarios: { title: "Prontuários", description: "Abra o perfil do atleta para consultar seu histórico autorizado.", isAvailable: true },
  auditoria: { title: "Auditoria", description: "Consulte as operações recentes registradas na trilha de auditoria.", isAvailable: true },
} as const;

export function availableSections(canReadAudit: boolean) {
  return Object.entries(sections).filter(([slug]) => slug !== "auditoria" || canReadAudit);
}

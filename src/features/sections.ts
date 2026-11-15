import type { IconName } from "../components/icon";

type Section = { title: string; description: string; isAvailable: boolean; icon: IconName };

export const sections = {
  atletas: { title: "Buscar atleta", description: "Localize um atleta ao qual seu perfil tem acesso.", isAvailable: true, icon: "search" },
  evolucoes: { title: "Nova evolução", description: "O editor estará disponível com o módulo de evoluções.", isAvailable: false, icon: "note" },
  prontuarios: { title: "Prontuários", description: "Abra o perfil do atleta para consultar seu histórico autorizado.", isAvailable: true, icon: "records" },
  auditoria: { title: "Auditoria", description: "Consulte as operações recentes registradas na trilha de auditoria.", isAvailable: true, icon: "audit" },
} as const satisfies Record<string, Section>;

export function availableSections(canReadAudit: boolean) {
  return Object.entries(sections).filter(([slug]) => slug !== "auditoria" || canReadAudit);
}

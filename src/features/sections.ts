import type { IconName } from "../components/icon";

type Section = { title: string; description: string; isAvailable: boolean; icon: IconName };

export const sections = {
  atletas: { title: "Atletas", description: "Busque, filtre e abra o perfil autorizado.", isAvailable: true, icon: "athletes" },
  evolucoes: { title: "Nova evolução", description: "Selecione o atleta para iniciar um atendimento autorizado.", isAvailable: true, icon: "note" },
  prontuarios: { title: "Prontuários", description: "Abra o perfil do atleta para consultar seu histórico autorizado.", isAvailable: true, icon: "records" },
  auditoria: { title: "Auditoria", description: "Consulte as operações recentes registradas na trilha de auditoria.", isAvailable: true, icon: "audit" },
} as const satisfies Record<string, Section>;

const navigationOrder = ["atletas", "auditoria"] as const;

export function availableSections(canReadAudit: boolean) {
  return Object.entries(sections).filter(([slug]) => slug !== "auditoria" || canReadAudit);
}

export function navigationSections(canReadAudit: boolean) {
  return navigationOrder
    .filter((slug) => slug !== "auditoria" || canReadAudit)
    .map((slug) => [slug, sections[slug]] as const);
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toLocaleUpperCase("pt-BR");
}

export function Avatar({ name, size = "md", athleteId, photoVersion }: { name: string; size?: "sm" | "md" | "lg"; athleteId?: string; photoVersion?: string | null }) {
  if (athleteId && photoVersion) {
    // Authenticated image requests must carry the browser session.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`avatar avatar-${size}`} src={`/api/atletas/${athleteId}/foto?v=${photoVersion}`} alt="" width={72} height={72} />;
  }
  return <span className={`avatar avatar-${size}`} title={`Iniciais de ${name}`} aria-hidden="true">{initials(name)}</span>;
}

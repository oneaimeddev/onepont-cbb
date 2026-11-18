const civil = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const month = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  month: "long",
  year: "numeric",
});
export function recordWhen(iso: string) {
  const key = civil.format(new Date(iso));
  const label = month.format(new Date(iso));
  return {
    date: key,
    monthId: key.slice(0, 7),
    monthLabel: label.charAt(0).toLocaleUpperCase("pt-BR") + label.slice(1),
    day: String(Number(key.slice(8))),
  };
}
export function groupsOf<T extends { occurred_at: string }>(records: T[]) {
  const groups: { id: string; label: string; records: T[] }[] = [];
  for (const record of records) {
    const when = recordWhen(record.occurred_at);
    const current = groups.at(-1);
    if (current?.id === when.monthId) current.records.push(record);
    else
      groups.push({
        id: when.monthId,
        label: when.monthLabel,
        records: [record],
      });
  }
  return groups;
}
export function updateProfileQuery(values: Record<string, string>) {
  const next = new URL(location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  }
  window.history.replaceState(
    null,
    "",
    next.pathname + next.search + next.hash,
  );
}

export function profileFilterDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : "";
}

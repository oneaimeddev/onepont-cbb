export type BirthParts = { day: string; month: string; year: string };
export type BirthField = keyof BirthParts;

export function saoPauloToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function birthParts(value: string): BirthParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) } : { day: "", month: "", year: "" };
}

export function validateBirth(parts: BirthParts, today: string): { value: string; error: string | null; field?: BirthField } {
  const { day, month, year } = parts;
  if (!day && !month && !year) return { value: "", error: null };
  for (const [field, label] of [["day", "dia"], ["month", "mês"], ["year", "ano"]] as const) {
    if (!parts[field]) return { value: "", error: `Selecione o ${label} para completar o nascimento.`, field };
  }
  const d = Number(day), m = Number(month), y = Number(year);
  if (!/^\d{4}$/.test(year) || y < 1900 || y > Number(today.slice(0, 4))) return { value: "", error: "Selecione um ano de 1900 até o ano atual.", field: "year" };
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!Number.isInteger(m) || m < 1 || m > 12) return { value: "", error: "Selecione um mês válido.", field: "month" };
  if (!Number.isInteger(d) || d < 1 || d > days[m - 1]) return { value: "", error: `Esse mês tem ${days[m - 1]} dias em ${year}. Confira o dia selecionado.`, field: "day" };
  // Birth is a civil date. No timestamp or timezone conversion is applied to it.
  const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  if (value > today) return { value: "", error: "A data de nascimento não pode ser futura.", field: "day" };
  return { value, error: null };
}

import { Fragment } from "react";

// Evolution and report bodies are stored as plain text. Section titles are recognised by their
// layout and shown in bold, so the reader never sees formatting characters:
// - numbered titles in capitals, as in "3. QUEIXA PRINCIPAL";
// - a title line in capitals, as in "RELATÓRIO MÉDICO - CONSULTA";
// - a short label on its own line ending in a colon, as in "Exames complementares:".
const numbered = /^\d{1,2}[.)]\s+[^a-z•]{3,80}:?$/u;
const capitals = /^[A-ZÀ-Ý][A-ZÀ-Ý0-9 ()/.,–-]{5,80}$/u;
const label = /^[A-ZÀ-Ý][^:•]{2,58}:$/u;

export function isSectionTitle(line: string) {
  const text = line.trim();
  if (!text || text.startsWith("•")) return false;
  if (numbered.test(text)) return /\p{Lu}{3}/u.test(text);
  if (capitals.test(text)) return /\p{Lu}{4}/u.test(text) && !/\d{2}[./]\d/.test(text);
  return label.test(text);
}

/** Renders clinical plain text with its section titles in bold; keep it inside a pre-wrap block. */
export function ClinicalText({ text }: { text?: string | null }) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, index) => (
    <Fragment key={index}>
      {isSectionTitle(line) ? <strong className="clinical-title">{line}</strong> : line}
      {index < lines.length - 1 ? "\n" : null}
    </Fragment>
  ));
}

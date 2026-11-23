import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { isPrescription } from "../documents/content.ts";
import { prescriptionGroups } from "../documents/prescription-format.ts";
import type { ReviewMaterial } from "../documents/review-types";

export const unsignedNotice = "PRÉVIA NÃO ASSINADA — SEM VALIDADE PARA DISPENSAÇÃO";

/** Only the finalized delivery snapshot is accepted; never query the mutable editor. */
export async function prescriptionPdf(material: Omit<ReviewMaterial, "id"> & { document_id: string }, snapshotId: string) {
  if (material.document_type !== "prescription" || !isPrescription(material.content))
    throw new Error("Only demo prescriptions are supported");
  const pdf = await PDFDocument.create();
  pdf.setTitle("Prescrição demonstrativa - Prontuário CBB");
  pdf.setCreationDate(new Date(material.created_at));
  pdf.setModificationDate(new Date(material.created_at));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]), y = 0;
  // Standard PDF fonts cover Portuguese. Escape unsupported glyphs visibly instead of
  // silently dropping clinical characters; wrapping measures actual font widths.
  const supported = new Set(font.getCharacterSet());
  const safe = (s: string) => Array.from(s).map(c => supported.has(c.codePointAt(0)!) ? c : `[U+${c.codePointAt(0)!.toString(16).toUpperCase()}]`).join("");
  function start() {
    page.drawText("Prontuário CBB | Prescrição demonstrativa", { x: 42, y: 797, size: 15, font, color: rgb(.06,.16,.29) });
    page.drawText(unsignedNotice, { x: 42, y: 771, size: 10, font, color: rgb(.64,.15,.19) });
    page.drawText("Assinatura demonstrativa. Nenhuma assinatura digital válida.", { x: 42, y: 754, size: 10, font });
    y = 725;
  }
  function line(text: string, size = 11, x = 42, face = font) {
    for (const paragraph of safe(text).split(/\r?\n/)) {
      let current = "";
      for (const char of paragraph) {
        if (face.widthOfTextAtSize(current + char, size) > 547 - x) {
          draw(current, size, x, face); current = "";
        }
        current += char;
      }
      draw(current, size, x, face);
    }
  }
  function draw(text: string, size: number, x = 42, face = font) {
    if (y < 64) { page = pdf.addPage([595.28,841.89]); start(); }
    page.drawText(text, { x, y, size, font: face, color:rgb(.08,.17,.27) }); y -= size + 6;
  }
  // "1. Dipirona 500 mg comprimido .......... 1 caixa": quantity right-aligned with a dotted leader.
  function item(title: string, quantity: string) {
    const size = 12;
    const right = quantity ? safe(quantity) : "";
    const room = 505 - (right ? bold.widthOfTextAtSize(` ${right}`, size) + 24 : 0);
    if (!right || bold.widthOfTextAtSize(safe(title), size) > room) {
      line(title, size, 42, bold);
      if (right) line(right, size, 42 + 505 - bold.widthOfTextAtSize(right, size), bold);
      return;
    }
    const head = safe(title);
    let leader = " ";
    while (bold.widthOfTextAtSize(`${head}${leader}. ${right}`, size) < 505) leader += ".";
    draw(`${head}${leader} ${right}`, size, 42, bold);
  }
  start();
  line(`Documento: ${material.document_id}`);
  line(`Versão finalizada: ${material.version}`);
  line(`Snapshot: ${snapshotId}`, 9);
  line(`Atleta: ${material.athlete_name}`);
  line(`Médico responsável: ${material.author_name}`);
  line(`Identificação profissional: ${material.credential_label ?? "Não informada"}`);
  line(`Data: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(material.created_at))}`);
  line("");
  for (const group of prescriptionGroups(material.content.items)) {
    line(group.heading, 11, 42, bold);
    for (const entry of group.lines) {
      item(`${entry.number}. ${entry.title}`, entry.quantity);
      if (entry.directions) line(entry.directions, 11, 60);
      line("");
    }
  }
  if (material.content.notes) line(`Observações: ${material.content.notes}`);
  line("");
  line("");
  line("______________________________________", 11, 170);
  line(material.author_name, 11, 170);
  line(material.credential_label ?? "Identificação profissional não informada", 10, 170);
  pdf.getPages().forEach((p,i) => p.drawText(`Demonstração interna | Página ${i+1} de ${pdf.getPageCount()}`, { x:42,y:32,size:9,font }));
  return Buffer.from(await pdf.save()).toString("base64");
}

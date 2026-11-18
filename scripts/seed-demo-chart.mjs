import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { localSupabase } from "./local-supabase.mjs";

if (process.env.NODE_ENV === "production" || localSupabase.url !== "http://127.0.0.1:54321") {
  throw new Error("Disponível somente no Supabase local.");
}

const marker = "DEMO fluxo";
const complaints = [
  ["joelho direito", "right", "Joelho"],
  ["tornozelo esquerdo", "left", "Tornozelo"],
  ["ombro direito", "right", "Ombro"],
  ["punho esquerdo", "left", "Punho"],
];
const exams = [
  ["Hemograma fictício", "laboratory", "", "not_applicable"],
  ["Ressonância magnética fictícia", "imaging", "Joelho", "right"],
  ["Radiografia fictícia", "imaging", "Tornozelo", "left"],
  ["Ultrassonografia fictícia", "imaging", "Ombro", "right"],
];
const medicines = [
  ["Dipirona fictícia", "500", "mg", "oral", "a cada oito horas"],
  ["Ibuprofeno fictício", "400", "mg", "oral", "a cada doze horas"],
  ["Paracetamol fictício", "750", "mg", "oral", "a cada oito horas"],
];

function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], {
    input: statement,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function uuid(key) {
  const chars = createHash("sha256").update(`demo-flow:${key}`).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = "8";
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function between(next, min, max) {
  return min + Math.floor(next() * (max - min + 1));
}

function day(next) {
  const date = new Date(Date.UTC(2026, 10, 17));
  date.setUTCDate(date.getUTCDate() - between(next, 0, 320));
  return date.toISOString().slice(0, 10);
}

function professional(email) {
  const row = sql(`select u.id || '|' || p.display_name from auth.users u join public.profiles p on p.id = u.id where u.email = ${quote(email)}`);
  if (!row) return null;
  const separator = row.indexOf("|");
  return { id: row.slice(0, separator), name: row.slice(separator + 1) };
}

const doctor = professional("medico.demo@example.com");
const physio = professional("fisioterapia.demo@example.com");
if (!doctor) throw new Error("Crie antes a conta medico.demo@example.com.");

const athletes = sql("select id || '|' || full_name from clinical.athletes where source = 'demo' order by full_name")
  .split("\n")
  .filter(Boolean)
  .map((row) => {
    const separator = row.indexOf("|");
    return { id: row.slice(0, separator), name: row.slice(separator + 1) };
  });

const statements = ["begin;"];
statements.push(`delete from clinical.record_revisions where record_id in (select id from clinical.records where title like ${quote(`${marker} ·%`)});`);
statements.push(`delete from clinical.records where title like ${quote(`${marker} ·%`)};`);
statements.push(`delete from clinical.document_revisions where document_id in (select id from clinical.documents where content::text like ${quote(`%${marker}%`)});`);
statements.push(`delete from clinical.documents where content::text like ${quote(`%${marker}%`)};`);

const totals = { athletes: 0, empty: 0, evolution: 0, prescription: 0, exam_request: 0, surgical_order: 0 };
const examples = [];

for (const athlete of athletes) {
  if (athlete.name === "Atleta DEMO Horizonte") {
    totals.empty += 1;
    continue;
  }
  const next = random(createHash("sha256").update(athlete.id).digest().readUInt32BE(0));
  if (next() < 0.22) {
    totals.empty += 1;
    continue;
  }
  const chosen = [];
  if (next() < 0.8) chosen.push("evolution");
  if (next() < 0.6) chosen.push("prescription");
  if (next() < 0.6) chosen.push("exam_request");
  if (next() < 0.45) chosen.push("surgical_order");
  if (chosen.length === 0) chosen.push(["evolution", "prescription", "exam_request", "surgical_order"][between(next, 0, 3)]);
  totals.athletes += 1;
  if (examples.length < 8) examples.push(`${athlete.name}: ${chosen.join(", ")}`);

  for (const kind of chosen) {
    const count = between(next, 2, 5);
    totals[kind] += count;
    for (let index = 0; index < count; index += 1) {
      const occurred = day(next);
      const complaint = complaints[index % complaints.length];
      const id = uuid(`${athlete.id}:${kind}:${index}`);
      if (kind === "evolution") {
        const byPhysio = physio && index % 2 === 1;
        const author = byPhysio ? physio : doctor;
        const specialty = byPhysio ? "Fisioterapia" : "Medicina";
        const draft = index === 0;
        const title = `${marker} · ${draft ? "Rascunho" : "Acompanhamento"} fictício de ${complaint[0]}`;
        const body = byPhysio
          ? `${marker}. Relato fictício de treino e amplitude no ${complaint[0]}. Não é uma medida clínica real.`
          : `${marker}. Queixa fictícia no ${complaint[0]} após treino. Sem diagnóstico definitivo e sem conduta real.`;
        statements.push(`insert into clinical.records(id, athlete_id, author_id, author_name, specialty, title, body, occurred_at, status, visibility)
          values(${quote(id)}, ${quote(athlete.id)}, ${quote(author.id)}::uuid, ${quote(author.name)}, ${quote(specialty)}, ${quote(title)}, ${quote(body)}, ${quote(`${occurred}T15:00:00Z`)}, ${quote(draft ? "draft" : "finalized")}, ${quote(draft ? "author_only" : "care_team")});`);
        continue;
      }
      const status = index === count - 1 && count >= 3 ? "ready_for_review" : "draft";
      let content;
      if (kind === "prescription") {
        const medicine = medicines[index % medicines.length];
        content = {
          notes: `${marker}. Prescrição fictícia. Não indica que o medicamento foi utilizado.`,
          items: [{
            id: uuid(`${id}:item`),
            name: medicine[0],
            presentation: "comprimido fictício",
            dose: medicine[1],
            dose_unit: medicine[2],
            route: medicine[3],
            schedule: medicine[4],
            duration: "3 dias",
            quantity: "9",
            instructions: "Registro de demonstração.",
          }],
        };
      } else if (kind === "exam_request") {
        const exam = exams[index % exams.length];
        content = {
          occurred_at: occurred,
          indication: `${marker}. Queixa fictícia no ${complaint[0]}.`,
          justification: `${marker}. Solicitação fictícia. Não é um resultado de exame.`,
          diagnosis: "",
          priority: index % 5 === 0 ? "priority" : "elective",
          additional: "",
          items: [{
            id: uuid(`${id}:item`),
            name: exam[0],
            exam_type: exam[1],
            region: exam[2],
            laterality: exam[3],
            technical_details: "",
            notes: "",
          }],
        };
      } else {
        content = {
          procedure: `Artroscopia fictícia de ${complaint[2].toLowerCase()}`,
          region: complaint[2],
          laterality: complaint[1],
          indication: `${marker}. Pedido fictício. Não é uma cirurgia realizada.`,
          diagnosis: "",
          justification: `${marker}. Texto de demonstração, sem indicação real.`,
          priority: "elective",
          additional: "",
          materials: "",
        };
      }
      statements.push(`insert into clinical.documents(id, athlete_id, author_id, author_name, credential_label, document_type, status, content, version, created_at, updated_at)
        values(${quote(id)}, ${quote(athlete.id)}, ${quote(doctor.id)}::uuid, ${quote(doctor.name)}, 'CRM fictício', ${quote(kind)}, ${quote(status)}, ${quote(JSON.stringify(content))}::jsonb, 1, ${quote(`${occurred}T12:00:00Z`)}, ${quote(`${occurred}T18:00:00Z`)});`);
    }
  }
}
statements.push("commit;");
sql(statements.join("\n"));

console.log(`Atletas com conteúdo novo: ${totals.athletes}. Sem conteúdo novo: ${totals.empty}.`);
console.log(`Evoluções ${totals.evolution}. Prescrições ${totals.prescription}. Solicitações de exame ${totals.exam_request}. Pedidos cirúrgicos ${totals.surgical_order}.`);
console.log("Exemplos:");
for (const example of examples) console.log(`- ${example}`);
console.log("Atleta DEMO Horizonte permanece sem registros novos.");

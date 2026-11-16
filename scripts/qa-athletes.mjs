import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { localSupabase } from "./local-supabase.mjs";

if (process.env.NODE_ENV === "production" || localSupabase.url !== "http://127.0.0.1:54321") {
  throw new Error("Disponível somente no Supabase local.");
}

const [command = "roster", seed = "cbb-qa-1"] = process.argv.slice(2);
if (!["roster", "reset"].includes(command)) {
  throw new Error("Use roster ou reset. A massa de 5.000 nomes repetidos foi substituída pelo elenco de categorias.");
}
if (!/^[\w.-]{1,40}$/.test(seed)) throw new Error("Seed inválida.");

const batch = "qa004:" + seed;
const categories = [
  { name: "Sub-15", year: 2012, count: 15 },
  { name: "Sub-17", year: 2010, count: 14 },
  { name: "Sub-19", year: 2008, count: 15 },
  { name: "Sub-21", year: 2006, count: 14 },
  { name: "Sub-23", year: 2004, count: 15 },
  { name: "Adulto", year: 1998, count: 14 },
];
const maleFirst = ["André", "Bruno", "Caio", "Diego", "Eduardo", "Felipe", "Gabriel", "Henrique", "Igor", "João", "Kaique", "Lucas", "Mateus", "Nicolas", "Otávio", "Alexandre", "Antônio", "Arthur", "Bernardo", "Breno", "Cauã", "Daniel", "Davi", "Enzo", "Erick", "Fernando", "Francisco", "Guilherme", "Gustavo", "Heitor", "Isaac", "Joaquim", "José", "Leonardo", "Lorenzo", "Luiz", "Marcelo", "Marcos", "Matheus", "Miguel", "Murilo", "Nathan", "Pedro", "Rafael", "Ricardo", "Rodrigo", "Samuel", "Thiago", "Vicente", "Vinícius", "Vitor", "Wesley", "Yago", "Adriano", "Alan", "Benício", "Carlos", "César", "Danilo", "Emanuel", "Fábio", "Hugo", "Ivan", "Júlio", "Leandro", "Márcio", "Nelson", "Oscar", "Paulo", "Renato", "Sérgio", "Tiago", "Ulisses", "Wagner", "Xavier", "Alberto", "Benedito", "Cláudio", "Douglas", "Elias", "Filipe", "Geraldo", "Hélio", "Iago", "Jonas", "Kevin", "Luan"];
const femaleFirst = ["Alice", "Beatriz", "Camila", "Daniela", "Elena", "Fernanda", "Gabriela", "Helena", "Isabela", "Juliana", "Larissa", "Manuela", "Natália", "Olívia", "Patrícia", "Amanda", "Ana Clara", "Ana Luiza", "Antônia", "Bianca", "Bruna", "Carla", "Carolina", "Cecília", "Clara", "Cristina", "Débora", "Elisa", "Emanuelly", "Estela", "Flávia", "Giovana", "Heloísa", "Ingrid", "Jéssica", "Joana", "Júlia", "Laís", "Laura", "Letícia", "Lívia", "Lorena", "Luana", "Luciana", "Luiza", "Maitê", "Maria Eduarda", "Mariana", "Melissa", "Milena", "Mirela", "Nicole", "Paloma", "Paula", "Pietra", "Rafaela", "Raquel", "Rebeca", "Renata", "Roberta", "Sabrina", "Sara", "Sofia", "Taís", "Talita", "Tatiane", "Valentina", "Vanessa", "Vitória", "Yasmin", "Ágatha", "Aline", "Bárbara", "Catarina", "Diana", "Eduarda", "Fabiana", "Giovanna", "Isadora", "Lavínia", "Maya", "Noemi", "Priscila", "Samara", "Tainá", "Valéria", "Emília"];
const surnames = ["Almeida", "Barbosa", "Cardoso", "Duarte", "Esteves", "Farias", "Gomes", "Henriques", "Ibrahim", "Junqueira", "Klein", "Lopes", "Machado", "Nogueira", "Oliveira", "Pereira", "Queiroz", "Ribeiro", "Souza", "Teixeira", "Uchoa", "Vasconcelos", "Wagner", "Xavier", "Yamamoto", "Zanetti"];
const clubs = {
  Masculino: ["Flamengo", "Franca", "Minas", "Pinheiros", "Bauru Basket", "Corinthians", "Paulistano", "São Paulo", "Unifacisa", "Vasco da Gama", "Brasília Basquete", "Caxias do Sul", "Mogi das Cruzes", "Pato Basquete", "Botafogo"],
  Feminino: ["Sesi Araraquara", "Corinthians", "Unimed Campinas", "Vera Cruz Campinas", "São José Basketball", "ADRM Maringá", "Santo André", "Ourinhos", "Basquete Blumenau", "Sampaio Basquete", "Cerrado Basquete", "Sport Recife", "Flamengo", "Minas", "Pinheiros"],
};
const professionals = [
  { email: "ortopedia.demo@example.com", displayName: "Dra. Helena Prado", profession: "Ortopedista", canEdit: true, creator: true },
  { email: "cardiologia.demo@example.com", displayName: "Dr. Caio Mendonça", profession: "Cardiologista", canEdit: false, creator: false },
  { email: "fisioterapia.demo@example.com", displayName: "Dra. Renata Guimarães", profession: "Fisioterapeuta", canEdit: false, creator: false },
  { email: "psicologia.demo@example.com", displayName: "Dra. Lúcia Andrade", profession: "Psicóloga", canEdit: false, creator: false },
];

function uuid(kind, index) {
  const chars = createHash("sha256").update(`${batch}:${kind}:${index}`).digest("hex").slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = "8";
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sql(statement) {
  return execFileSync("docker", ["exec", "-i", "supabase_db_prontuario-cbb", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], {
    input: statement,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function fullName(first, categoryIndex, index) {
  const last = surnames[(categoryIndex * 4 + index) % surnames.length];
  let second = surnames[(categoryIndex * 7 + index + 11) % surnames.length];
  if (second === last) second = surnames[(categoryIndex + index + 1) % surnames.length];
  return second === last ? `${first} ${last}` : `${first} ${last} ${second}`;
}

function rosterRows() {
  const rows = [];
  const seen = new Set();
  const given = { Feminino: 0, Masculino: 0 };
  let cursor = 0;
  categories.forEach((category, categoryIndex) => {
    for (const division of ["Feminino", "Masculino"]) {
      for (let index = 0; index < category.count; index += 1) {
        const pool = division === "Feminino" ? femaleFirst : maleFirst;
        const next = pool[given[division]];
        given[division] += 1;
        if (!next) throw new Error(`Faltam nomes próprios para o naipe ${division}.`);
        const givenName = category.name === "Sub-19" && division === "Feminino" && index === 0 ? "Marina" : next;
        const name = givenName === "Marina" ? "Marina Costa" : fullName(givenName, categoryIndex, index);
        if (seen.has(givenName) || seen.has(name)) throw new Error(`Nome repetido na seleção: ${name}`);
        seen.add(givenName);
        seen.add(name);
        const club = clubs[division][index % clubs[division].length];
        const previousClub = clubs[division][(index + 1) % clubs[division].length];
        const year = category.name === "Adulto" ? category.year - (index % 8) : category.year - (index % 2);
        const month = String(1 + ((index * 3) % 12)).padStart(2, "0");
        const day = String(1 + (index % 27)).padStart(2, "0");
        rows.push({
          id: uuid("athlete", cursor),
          name,
          birth: `${year}-${month}-${day}`,
          status: category.count === 15 && index === category.count - 1 ? "inactive" : "active",
          category: category.name,
          division,
          modality: index % 6 === 0 ? "3x3" : "5x5",
          club,
          previousClub: index % 8 === 0 ? previousClub : null,
          externalId: `DEMO-${seed}-${cursor}`,
          photo: cursor % 4 === 0,
          cursor,
        });
        cursor += 1;
      }
    }
  });
  return rows;
}

const removeBatch = `delete from clinical.record_revisions where record_id in (select id from clinical.records where athlete_id in (select id from clinical.athletes where qa_batch=${quote(batch)}));
delete from clinical.records where athlete_id in (select id from clinical.athletes where qa_batch=${quote(batch)});
delete from clinical.encounters where athlete_id in (select id from clinical.athletes where qa_batch=${quote(batch)});
delete from clinical.athletes where qa_batch=${quote(batch)};`;

if (command === "reset") {
  sql(`begin;\n${removeBatch}\ncommit;`);
  console.log("Massa da seed removida. Auditoria e contas preservadas.");
  process.exit(0);
}

const athletes = rosterRows();
const admin = createClient(localSupabase.url, localSupabase.adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
const existing = new Map(sql("select id || '|' || email from auth.users;").trim().split("\n").filter(Boolean).map((line) => {
  const separator = line.indexOf("|");
  return [line.slice(separator + 1), line.slice(0, separator)];
}));
const created = [];
let password = "";
for (const professional of professionals) {
  const found = existing.get(professional.email);
  if (found) {
    professional.id = found;
    continue;
  }
  if (!password) password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({ email: professional.email, password, email_confirm: true });
  if (error) throw error;
  const profile = await admin.from("profiles").insert({
    id: data.user.id,
    display_name: professional.displayName,
    profession: professional.profession,
    can_read_audit: false,
  });
  if (profile.error) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw profile.error;
  }
  professional.id = data.user.id;
  created.push(professional.email);
}

const photo = await sharp({ create: { width: 128, height: 128, channels: 3, background: "#102849" } }).webp().toBuffer();
const photoHex = photo.toString("hex");
const statements = ["begin;", removeBatch];
for (const category of categories) {
  for (const division of ["Feminino", "Masculino"]) {
    for (const modality of ["5x5", "3x3"]) {
      for (const season of [2025, 2026]) {
        statements.push(`insert into clinical.sport_options(category, modality, division, season) values(${quote(category.name)}, ${quote(modality)}, ${quote(division)}, ${season}) on conflict do nothing;`);
      }
    }
  }
}
for (const athlete of athletes) {
  const photoSql = athlete.photo ? `decode(${quote(photoHex)}, 'hex')` : "null";
  const photoVersion = athlete.photo ? quote(uuid("photo", athlete.cursor)) : "null";
  statements.push(`insert into clinical.athletes(id, full_name, birth_date, team, category, status, source, external_cbb_id, qa_batch, photo, photo_version)
    values(${quote(athlete.id)}, ${quote(athlete.name)}, ${quote(athlete.birth)}, ${quote(athlete.club)}, ${quote(athlete.category)}, ${quote(athlete.status)}, 'demo', ${quote(athlete.externalId)}, ${quote(batch)}, ${photoSql}, ${photoVersion});
    insert into clinical.sport_links(athlete_id, option_id, club, starts_on)
    select ${quote(athlete.id)}, id, ${quote(athlete.club)}, '2026-01-01'
    from clinical.sport_options
    where category=${quote(athlete.category)} and modality=${quote(athlete.modality)} and division=${quote(athlete.division)} and season=2026;`);
  if (athlete.previousClub) {
    statements.push(`insert into clinical.sport_links(athlete_id, option_id, club, starts_on, ends_on)
      select ${quote(athlete.id)}, id, ${quote(athlete.previousClub)}, '2025-01-01', '2025-12-31'
      from clinical.sport_options
      where category=${quote(athlete.category)} and modality=${quote(athlete.modality)} and division=${quote(athlete.division)} and season=2025;`);
  }
}

const marina = athletes.find((athlete) => athlete.name === "Marina Costa");
for (const professional of professionals) {
  statements.push(`insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
    select id, ${quote(professional.id)}::uuid, true, ${professional.canEdit}, true, true
    from clinical.athletes where qa_batch=${quote(batch)};`);
  if (professional.creator) {
    statements.push(`insert into clinical.athlete_creators(professional_id, can_write_created, can_finalize_created)
      values(${quote(professional.id)}::uuid, true, true)
      on conflict(professional_id) do update set can_write_created=true, can_finalize_created=true;`);
  }
}
statements.push(`insert into clinical.athlete_access(athlete_id, professional_id, can_read_records, can_edit, can_write, can_finalize)
  select athletes.id, users.id, true, true, true, true
  from clinical.athletes athletes
  join auth.users users on users.email='medico.demo@example.com'
  where athletes.qa_batch=${quote(batch)}
  on conflict(athlete_id, professional_id) do update
  set can_read_records=true, can_edit=true, can_write=true, can_finalize=true;`);

const notes = [
  ["ortopedia.demo@example.com", "Ortopedista", "Acompanhamento fictício do joelho", "Registro sintético. Relato de treino sem lesão diagnosticada."],
  ["cardiologia.demo@example.com", "Cardiologista", "Acompanhamento fictício cardiovascular", "Registro sintético. Nenhuma alteração foi inventada além deste texto de demonstração."],
  ["fisioterapia.demo@example.com", "Fisioterapeuta", "Acompanhamento fictício de fisioterapia", "Registro sintético. Exercícios de demonstração, sem medida clínica real."],
  ["psicologia.demo@example.com", "Psicóloga", "Acompanhamento fictício de psicologia", "Registro sintético. Conversa de demonstração, sem conteúdo clínico real."],
];
notes.forEach((note, index) => {
  const author = professionals.find((professional) => professional.email === note[0]);
  statements.push(`insert into clinical.encounters(id, athlete_id, author_id, specialty, occurred_at, status)
    values(${quote(uuid("encounter", index))}, ${quote(marina.id)}, ${quote(author.id)}::uuid, ${quote(note[1])}, ${quote(`2026-10-${String(4 + index).padStart(2, "0")}T15:00:00Z`)}, 'closed');
    insert into clinical.records(id, athlete_id, author_id, author_name, specialty, title, body, occurred_at, status, visibility, encounter_id)
    values(${quote(uuid("record", index))}, ${quote(marina.id)}, ${quote(author.id)}::uuid, ${quote(author.displayName)}, ${quote(note[1])}, ${quote(note[2])}, ${quote(note[3])}, ${quote(`2026-10-${String(4 + index).padStart(2, "0")}T15:00:00Z`)}, 'finalized', 'care_team', ${quote(uuid("encounter", index))});`);
});
statements.push("commit;");
if (created.length) console.log(`Senha local das contas novas (${created.join(", ")}): ${password}`);
sql(statements.join("\n"));

const byDivision = { Feminino: 0, Masculino: 0 };
for (const athlete of athletes) byDivision[athlete.division] += 1;
console.log(`Elenco fictício de ${athletes.length} atletas. Feminino ${byDivision.Feminino}, masculino ${byDivision.Masculino}. Seed ${seed}.`);
console.log("Contas: " + professionals.map((professional) => `${professional.email} (${professional.profession})`).join(", "));
if (!created.length) console.log("As quatro contas já existiam. A senha não foi alterada.");

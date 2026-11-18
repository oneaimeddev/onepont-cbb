import Papa from "papaparse";

export const CSV_LIMIT = 5000;
export const FILE_LIMIT = 5 * 1024 * 1024;
export const fields = [
 ["name", "nome_completo", "Nome completo (obrigatório)"],
 ["social", "nome_social", "Nome social"],
 ["birth", "data_nascimento", "Nascimento (AAAA-MM-DD)"],
 ["document", "identificador_institucional", "CPF ou identificador institucional"],
 ["gender_identity", "identidade_genero", "Identidade de gênero"],
 ["category", "categoria", "Categoria"], ["division", "naipe_competitivo", "Naipe competitivo"],
 ["modality", "modalidade", "Modalidade"], ["position", "posicao", "Posição"],
 ["club", "clube", "Clube ou equipe"], ["shirt", "numero_camisa", "Número da camisa"],
 ["phone", "telefone", "Telefone"], ["email", "email", "E-mail"],
 ["guardian_name", "responsavel_legal", "Responsável legal"],
 ["guardian_relation", "relacao_responsavel", "Relação com responsável"],
 ["guardian_contact", "contato_responsavel", "Contato do responsável"],
 ["emergency_contact", "contato_emergencia", "Contato de emergência"],
] as const;
export type Field = typeof fields[number][0];
export type CsvRow = { line: number; payload: Record<string, string>; decision?: "ignore" | "create" };
export type RowResult = { line: number; state: string; review_state?: string; field?: string | null; id?: string | null; matches?: {id: string; name: string}[] };
export type ImportJob = { id: string; state: string; total: number; processed: number; created: number; ignored: number; rejected: number; duplicates: number; rows: RowResult[]; error?: string };
export const stateLabels: Record<string,string> = { ready: "Pronto para cadastrar", duplicate: "Possível duplicidade", invalid: "Linha inválida", repeat: "Registro repetido ou já importado", created: "Criado", ignored: "Ignorado", rejected: "Rejeitado" };
export const correction: Record<string,string> = {
 name: "Informe nome com até 160 caracteres. Revise também o tamanho dos demais campos.",
 social: "Use até 160 caracteres.", birth: "Use uma data real entre 1900 e hoje, no formato AAAA-MM-DD.",
 document: "Use até 40 caracteres: letras, números, ponto, barra ou hífen.",
 category: "Selecione ou cadastre uma categoria existente na revisão.", club: "Selecione ou cadastre um clube existente na revisão.",
 category_id: "Preencha categoria, naipe e modalidade juntos para registrar o vínculo.",
 division: "Use Feminino ou Masculino, conforme o catálogo.", modality: "Use uma modalidade do catálogo, como 5x5 ou 3x3.",
 phone: "Use de 8 a 20 caracteres: números e sinais de telefone.", email: "Informe e-mail válido com até 160 caracteres.",
 shirt: "Use de um a três dígitos.", position: "Use até 40 caracteres.", gender_identity: "Use feminino, masculino, nao_binario, outro ou nao_informado.",
 guardian_name: "Use até 160 caracteres.", guardian_relation: "Use até 40 caracteres.",
 guardian_contact: "Use de 8 a 160 caracteres.", emergency_contact: "Use de 8 a 160 caracteres.",
};
export function key(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " "); }
export function parseCsv(text: string) {
 const content = text.replace(/^\uFEFF/, "");
 const delimiter = [",", ";"].map(value => ({ value, count: Papa.parse<string[]>(content, { delimiter: value, preview: 1, skipEmptyLines: "greedy" }).data[0]?.length ?? 0 })).sort((a,b) => b.count-a.count)[0].value;
 const parsed = Papa.parse<string[]>(content, { skipEmptyLines: "greedy", delimiter, dynamicTyping: false });
 if (parsed.errors.some(e => e.type !== "Delimiter")) throw new Error("CSV malformado. Confira aspas e delimitadores.");
 const [headers, ...records] = parsed.data;
 if (!headers?.length || headers.length > 60 || new Set(headers.map(key)).size !== headers.length || headers.some(h => !h.trim() || h.length > 160)) throw new Error("Use cabeçalhos únicos e preenchidos (até 60 colunas).");
 if (!records.length || records.length > CSV_LIMIT) throw new Error(`O arquivo deve conter de 1 a ${CSV_LIMIT} atletas.`);
 if (records.some(row => row.length !== headers.length)) throw new Error("Há linhas com quantidade de colunas diferente do cabeçalho. Corrija o arquivo.");
 const mapping = headers.map(header => fields.find(([id, csv]) => [id, csv].some(alias => key(alias) === key(header)))?.[0] ?? "");
 return { headers, records, mapping };
}
// Every domain field permits at most 160 characters. Retain one excess character
// so the server can reject oversized cells without transporting megabytes per row.
export function mappedRows(records: string[][], mapping: string[]): CsvRow[] {
 return records.map((record, index) => ({ line: index + 2, payload: Object.fromEntries(mapping.flatMap((field, i) => field ? [[field, Array.from(record[i].trim()).slice(0, 161).join("")]] : [])) }));
}
export function csvReport(rows: string[][]) {
 // Spreadsheet formula protection applies even when leading whitespace precedes a formula.
 return "\uFEFF" + Papa.unparse(rows.map(row => row.map(cell => /^[\s]*[=+\-@\t\r]/.test(cell) ? "'" + cell : cell)), { delimiter: ";" });
}
export function templateCsv() {
 return csvReport([fields.map(([,csv]) => csv), ["Atleta Demonstração", "", "2010-04-12", "DEMO-0001", "", "", "", "", "", "", "", "", "atleta@example.com", "", "", "", ""]]);
}

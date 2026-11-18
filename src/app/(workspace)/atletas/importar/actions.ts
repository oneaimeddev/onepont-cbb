"use server";
import { revalidatePath } from "next/cache";
import { requireProfile } from "../../../../lib/profile";
import { supabaseServer } from "../../../../lib/supabase";
import type { CsvRow, ImportJob, RowResult } from "../../../../features/athletes/csv";

export async function importJob(id: string, operation: "start" | "status" | "confirm", digest?: string, total?: number): Promise<ImportJob> {
 await requireProfile();
 const client = await supabaseServer();
 const { data, error } = await client.rpc("athlete_import_job", { target: id, operation, digest: digest ?? null, row_count: total ?? null });
 if (error || data?.error || !data) throw new Error("Não foi possível consultar ou confirmar a importação. Verifique seu acesso e tente novamente.");
 return data as ImportJob;
}
export async function importBatch(id: string, rows: CsvRow[], execute: boolean): Promise<RowResult[]> {
 await requireProfile();
 const client = await supabaseServer();
 const { data, error } = await client.rpc("athlete_import_batch", { target: id, items: rows, execute_rows: execute });
 if (error || data?.error || !data) throw new Error("O lote não foi confirmado. Retome a operação para consultar o resultado real.");
 if (execute) revalidatePath("/atletas");
 return data.rows as RowResult[];
}

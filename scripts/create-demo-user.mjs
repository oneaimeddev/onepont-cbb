import { createClient } from "@supabase/supabase-js";

const [email, role = "medico"] = process.argv.slice(2);
const password = (await new Response(process.stdin).text()).replace(/\r?\n$/, "");
const roles = {
  medico: { profession: "Medicina esportiva", can_read_audit: false },
  fisio: { profession: "Fisioterapia", can_read_audit: false },
  auditor: { profession: "Administração operacional", can_read_audit: true },
};
if (!email?.endsWith("@example.com")) throw new Error("Use um e-mail fictício @example.com.");
if (!Object.hasOwn(roles, role)) throw new Error("Escolha o perfil medico, fisio ou auditor.");
if (!password) throw new Error("Nenhuma senha recebida. Digite sua senha quando o comando read estiver aguardando.");
if (password.length < 12) throw new Error("Digite uma senha de pelo menos 12 caracteres.");

const { localSupabase } = await import("./local-supabase.mjs");

const client = createClient(localSupabase.url, localSupabase.adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true });
if (error) throw error;

const { error: profileError } = await client.from("profiles").insert({
  id: data.user.id,
  display_name: `Profissional DEMO · ${email.split("@")[0]}`,
  ...roles[role],
});
if (profileError) {
  const { error: cleanupError } = await client.auth.admin.deleteUser(data.user.id);
  if (cleanupError) throw new AggregateError([profileError, cleanupError], "Falha ao criar perfil e remover conta incompleta.");
  throw profileError;
}
console.log("Conta de demonstração criada.");

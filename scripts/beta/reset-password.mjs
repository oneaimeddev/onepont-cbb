import { users, keys, client } from "./remote.mjs";
import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const email = process.argv[2];
if (!users.some(u => u.email === email)) throw new Error("Conta fora dos sete usuários beta.");
const password = (await new Response(process.stdin).text()).replace(/\r?\n$/, "");
if (password.length < 6) throw new Error("Informe a nova senha por entrada oculta do terminal.");
const admin = client(keys().service);
const list = await admin.auth.admin.listUsers({ perPage: 1000 });
if (list.error) throw new Error("Consulta administrativa indisponível.");
const user = list.data.users.find(u => u.email === email);
if (!user || user.app_metadata?.cbb_beta_batch !== "beta-008b-v1") throw new Error("Conta beta não encontrada.");
const result = await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
if (result.error) throw new Error("Redefinição recusada; valores privados omitidos.");
if (users.find(u => u.email === email).admin)
  writeFileSync(join(homedir(), ".config/prontuario-cbb/beta-admin.json"), JSON.stringify({ projectRef: "noqixverpzgvfrcybrrt", email, password },null,2), {mode:0o600});
console.log(`Senha redefinida administrativamente: ${email}. Nenhum e-mail enviado.`);

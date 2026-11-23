import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase";

export const getAccess = cache(async () => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error && error.status && error.status >= 500) throw new Error("Autenticação indisponível.");
  if (!data.user) return { status: 401 } as const;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name, profession, can_read_audit, can_manage_access")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) throw new Error("Não foi possível consultar o perfil profissional.");
  if (!profile) return { status: 403 } as const;
  return { status: 200, profile, userId: data.user.id } as const;
});

export async function requireProfile() {
  const access = await getAccess();
  if (access.status === 401) redirect("/login");
  if (access.status === 403) redirect("/login?perfil=pendente");
  return access.profile;
}

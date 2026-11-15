"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "../../lib/supabase";

export async function login(form: FormData) {
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || !email.trim() || email.length > 254 ||
      typeof password !== "string" || !password || password.length > 256) {
    redirect("/login?erro=1");
  }
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) redirect("/login?erro=1");
  redirect("/");
}

export async function logout() {
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) redirect("/login?saida=erro");
  redirect("/login");
}

export function demoEnvironmentAllowed(
  env: Record<string, string | undefined>,
): boolean {
  // Hosted demonstration is explicitly bound to its dedicated Supabase project.
  // Production/preview deployments without this binding remain denied.
  const ref = env.CBB_DEMO_SUPABASE_PROJECT_REF;
  const boundDemo = env.CBB_DEPLOYMENT_ENV === "controlled-demo" &&
    !!ref?.match(/^[a-z]{20}$/) &&
    env.NEXT_PUBLIC_SUPABASE_URL === `https://${ref}.supabase.co`;
  return (
    env.CBB_SIGNING_MODE === "demo" &&
    ["local", "test", "controlled-demo"].includes(
      env.CBB_DEPLOYMENT_ENV ?? "",
    ) &&
    (!env.VERCEL_ENV?.match(/^(production|preview)$/) || boundDemo)
  );
}

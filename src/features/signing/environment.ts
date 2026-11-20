export function demoEnvironmentAllowed(
  env: Record<string, string | undefined>,
): boolean {
  return (
    env.CBB_SIGNING_MODE === "demo" &&
    ["local", "test", "controlled-demo"].includes(
      env.CBB_DEPLOYMENT_ENV ?? "",
    ) &&
    !env.VERCEL_ENV?.match(/^(production|preview)$/)
  );
}

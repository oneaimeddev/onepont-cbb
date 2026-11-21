import { test, expect } from "@playwright/test";
import { demoEnvironmentAllowed } from "../src/features/signing/environment.ts";
import { deliveryEnvironmentAllowed } from "../src/features/delivery/engine.ts";
const ref = "noqixverpzgvfrcybrrt";
const beta = { CBB_SIGNING_MODE: "demo", CBB_DEPLOYMENT_ENV: "controlled-demo",
  CBB_DEMO_SUPABASE_PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`, VERCEL_ENV: "production" };
test("hosted demo requires explicit mode and exact dedicated project binding", () => {
  for (const gate of [demoEnvironmentAllowed, deliveryEnvironmentAllowed]) {
    expect(gate(beta)).toBe(true);
    expect(gate({ ...beta, VERCEL_ENV: "preview" })).toBe(true);
    expect(gate({ ...beta, CBB_SIGNING_MODE: "off" })).toBe(false);
    expect(gate({ ...beta, CBB_DEPLOYMENT_ENV: "operational" })).toBe(false);
    expect(gate({ ...beta, CBB_DEPLOYMENT_ENV: "local" })).toBe(false);
    expect(gate({ ...beta, CBB_DEMO_SUPABASE_PROJECT_REF: "" })).toBe(false);
    expect(gate({ ...beta, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe(false);
    expect(gate({ ...beta, NEXT_PUBLIC_SUPABASE_URL: "https://different.supabase.co" })).toBe(false);
  }
});

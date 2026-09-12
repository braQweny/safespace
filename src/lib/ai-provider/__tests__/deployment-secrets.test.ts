import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../../../scripts/write-production-secrets.mjs", import.meta.url));
const temporary: string[] = [];
function run(provider: string, env: Record<string, string>) {
  const cwd = mkdtempSync(join(tmpdir(), "safespace-provider-secrets-"));
  temporary.push(cwd);
  writeFileSync(join(cwd, "wrangler.jsonc"), `{\n// selected provider\n"vars": {"AI_PROVIDER": "${provider}",},\n}`);
  const result = spawnSync(process.execPath, [script], {
    cwd,
    env: { SUPABASE_URL: "https://example.supabase.co", SUPABASE_KEY: "dummy-public-key", ...env },
    encoding: "utf8",
  });
  return { ...result, path: join(cwd, ".env.production") };
}
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("deployment secrets for the selected provider", () => {
  it("requires the OpenAI key even when an OpenRouter key exists", () => {
    const result = run("openai", { OPENROUTER_API_KEY: "dummy-router" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("OPENAI_API_KEY GitHub secret is required");
    expect(existsSync(result.path)).toBe(false);
    expect(result.stderr).not.toContain("dummy-router");
  });
  it.each(["openai", "openrouter"])("writes both available keys privately for %s without printing them", (provider) => {
    const result = run(provider, { OPENAI_API_KEY: "dummy-openai", OPENROUTER_API_KEY: "dummy-router" });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toBe("");
    expect(readFileSync(result.path, "utf8")).toContain("OPENAI_API_KEY=dummy-openai\nOPENROUTER_API_KEY=dummy-router");
    expect(statSync(result.path).mode & 0o777).toBe(0o600);
  });
  it("permits an OpenRouter rollback without an OpenAI key", () => {
    const result = run("openrouter", { OPENROUTER_API_KEY: "dummy-router" });
    expect(result.status).toBe(0);
    expect(readFileSync(result.path, "utf8")).not.toContain("OPENAI_API_KEY");
  });
  it.each([
    ["openai", { OPENAI_API_KEY: "sk-or-dummy" }],
    ["openai", { OPENAI_API_KEY: "dummy\nINJECTED=value" }],
    ["unknown", { OPENAI_API_KEY: "dummy" }],
  ])("refuses invalid credentials/configuration before writing secrets", (provider, env) => {
    const result = run(provider, env);
    expect(result.status).not.toBe(0);
    expect(existsSync(result.path)).toBe(false);
    expect(result.stdout + result.stderr).not.toContain("INJECTED=value");
  });
});

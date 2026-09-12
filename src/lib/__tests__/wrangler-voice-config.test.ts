import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

function readWranglerConfig() {
  const raw = readFileSync(resolve(ROOT, "wrangler.jsonc"), "utf8");
  // JSONC: comments and trailing commas are not JSON.
  const stripped = raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped) as {
    main: string;
    durable_objects?: { bindings?: { name: string; class_name: string }[] };
    migrations?: { tag: string; new_sqlite_classes?: string[] }[];
    unsafe?: { bindings?: { name: string; namespace_id: string }[] };
    vars?: Record<string, string>;
  };
}

describe("wrangler voice configuration", () => {
  const config = readWranglerConfig();

  it("uses the custom Worker entry that exports the observer class next to the Astro handler", () => {
    expect(config.main).toBe("src/worker.ts");
    const worker = readFileSync(resolve(ROOT, "src/worker.ts"), "utf8");
    expect(worker).toContain('import { handle } from "@astrojs/cloudflare/handler"');
    expect(worker).toContain("export default { fetch: handle }");
    const binding = config.durable_objects?.bindings?.find((entry) => entry.name === "VOICE_SESSION_OBSERVER");
    expect(binding).toBeDefined();
    expect(worker).toContain(`export { ${binding?.class_name} } from "@/lib/voice/observer-durable-object"`);
  });

  it("declares the SQLite-backed observer class in the first migration tag", () => {
    const migration = config.migrations?.find((entry) => entry.new_sqlite_classes?.includes("VoiceSessionObserver"));
    expect(migration?.tag).toBe("v1");
  });

  it("gives the voice endpoints their own rate limiter with a unique namespace", () => {
    const limiters = config.unsafe?.bindings ?? [];
    const voice = limiters.find((entry) => entry.name === "VOICE_RATE_LIMITER");
    expect(voice).toBeDefined();
    const namespaces = limiters.map((entry) => entry.namespace_id);
    expect(new Set(namespaces).size).toBe(namespaces.length);
  });

  it("keeps the voice flag off in production until the rollout flips it deliberately", () => {
    expect(config.vars?.VOICE_SESSION_MODE).toBe("off");
    expect(config.vars?.VOICE_MONTHLY_MINUTES).toMatch(/^[1-9]\d*$/);
  });
});

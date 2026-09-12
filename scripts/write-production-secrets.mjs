import { readFileSync, writeFileSync } from "node:fs";

// Read the same provider that Wrangler will publish. Validate before migrations
// and never print secret values (including when configuration is incomplete).
const raw = readFileSync("wrangler.jsonc", "utf8");
const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"));
const provider = config.vars?.AI_PROVIDER ?? "openai";
if (provider !== "openai" && provider !== "openrouter") throw new Error("Invalid AI_PROVIDER in wrangler.jsonc");
const selectedKey = provider === "openai" ? "OPENAI_API_KEY" : "OPENROUTER_API_KEY";
for (const name of ["SUPABASE_URL", "SUPABASE_KEY", selectedKey]) {
  if (!process.env[name]?.trim()) throw new Error(`${name} GitHub secret is required for deployment`);
}
if (provider === "openai" && process.env.OPENAI_API_KEY.trim().startsWith("sk-or-")) {
  throw new Error("OPENAI_API_KEY must be an OpenAI key, not an OpenRouter key");
}
const names = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "OPERATIONAL_LOG_HASH_SECRET",
  "SUPPORT_EMAIL",
];
const lines = [];
for (const name of names) {
  const value = process.env[name]?.trim();
  if (!value) continue;
  if (/[\r\n]/.test(value)) throw new Error(`Invalid multiline deployment value: ${name}`);
  lines.push(`${name}=${value}`);
}
writeFileSync(".env.production", `${lines.join("\n")}\n`, { mode: 0o600 });

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const secretFile = resolve(root, ".dev.vars.billing");
const vars = parseEnv(await readFile(secretFile, "utf8"));
const app = new URL(vars.BILLING_APP_URL);
const db = new URL(vars.BILLING_DATABASE_URL);
const auth = new URL(vars.SUPABASE_URL);
if (
  vars.BILLING_MODE !== "sandbox" ||
  !vars.STRIPE_SECRET_KEY?.startsWith("sk_test_") ||
  !vars.STRIPE_WEBHOOK_SECRET?.startsWith("whsec_") ||
  !vars.STRIPE_PRICE_ID?.startsWith("price_") ||
  app.origin !== "http://127.0.0.1:4321" ||
  !["localhost", "127.0.0.1"].includes(auth.hostname) ||
  auth.port !== "54321" ||
  !["localhost", "127.0.0.1"].includes(db.hostname) ||
  db.port !== "54322" ||
  db.username !== "safespace_billing_login"
) {
  throw new Error("Expected the dedicated local sandbox configuration in .dev.vars.billing.");
}
const builtDir = resolve(root, "dist/server");
const built = JSON.parse(await readFile(join(builtDir, "wrangler.json"), "utf8"));
const temporary = await mkdtemp(join(tmpdir(), "safespace-billing-"));
try {
  // Wrangler's main `secrets.required` intentionally lists production secrets
  // only. A separate local config loads all sandbox secrets without making them
  // mandatory for default-off CI/deploy, and never inherits remote bindings.
  const config = {
    name: "safespace-billing-sandbox",
    main: resolve(builtDir, built.main),
    compatibility_date: built.compatibility_date,
    compatibility_flags: built.compatibility_flags,
    no_bundle: built.no_bundle,
    rules: built.rules,
    assets: { ...built.assets, directory: resolve(builtDir, built.assets.directory) },
    kv_namespaces: [{ binding: "SESSION", id: "local-billing-only" }],
    images: { binding: "IMAGES" },
    unsafe: built.unsafe,
    vars: { ...built.vars, BILLING_MODE: "sandbox" },
  };
  const configFile = join(temporary, "wrangler.json");
  await writeFile(configFile, JSON.stringify(config));
  const child = spawn(
    process.execPath,
    [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--config",
      configFile,
      "--env-file",
      secretFile,
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      "4321",
      "--inspector-port",
      "0",
      "--persist-to",
      join(temporary, "state"),
      "--log-level",
      "warn",
    ],
    { cwd: temporary, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );
  const shutdown = () => child.kill("SIGTERM");
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  process.exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolveExit(signal ? 0 : (code ?? 1)));
  });
} finally {
  await rm(temporary, { recursive: true, force: true });
}

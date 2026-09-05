import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import process from "node:process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const server = join(root, "dist/server");
const built = JSON.parse(await readFile(join(server, "wrangler.json"), "utf8"));
const temporary = await mkdtemp(join(tmpdir(), "safespace-e2e-"));
try {
  // Copy only runtime configuration: never inherit configPath/userConfigPath,
  // production vars, remote bindings, .env files or the project's KV state.
  const config = {
    name: "safespace-e2e",
    main: resolve(server, built.main),
    compatibility_date: built.compatibility_date,
    compatibility_flags: built.compatibility_flags,
    no_bundle: built.no_bundle,
    rules: built.rules,
    assets: { ...built.assets, directory: resolve(server, built.assets.directory) },
    kv_namespaces: [{ binding: "SESSION", id: "local-e2e-only" }],
    images: { binding: "IMAGES" },
    vars: {
      BILLING_MODE: "off",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_KEY: "test-public-key",
      OPENROUTER_API_KEY: "",
    },
  };
  await writeFile(join(temporary, "wrangler.json"), JSON.stringify(config));
  await writeFile(join(temporary, "test.env"), "");
  const child = spawn(
    process.execPath,
    [
      join(root, "node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--config",
      join(temporary, "wrangler.json"),
      "--env-file",
      join(temporary, "test.env"),
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      "4327",
      "--inspector-port",
      "0",
      "--persist-to",
      join(temporary, "state"),
      "--log-level",
      "warn",
    ],
    { cwd: temporary, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } },
  );
  const shutdown = () => {
    child.kill("SIGTERM");
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  process.exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolveExit(signal ? 0 : (code ?? 1));
    });
  });
} finally {
  await rm(temporary, { recursive: true, force: true });
}

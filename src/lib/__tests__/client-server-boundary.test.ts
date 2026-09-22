/**
 * Wszystko, co island może zaimportować, ląduje w paczce klienta. Moduły
 * serwerowe — repozytorium prywatnych tabel (`session-data/**`), klient
 * Supabase, sekrety `astro:env/server`, runtime `cloudflare:workers` — nie
 * mają tam czego szukać: w najlepszym razie tree-shaking je wytnie, w
 * najgorszym przeglądarka dostanie kod granicy prywatności albo build padnie.
 * Test chodzi po grafie importów wartości od każdego modułu `src/components/`;
 * `import type` jest dozwolone (znika przy emisji).
 */
import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { describeChain, listSourceModules, SRC_ROOT, walkValueImports } from "./import-graph";

const SERVER_DIRECTORIES = [resolve(SRC_ROOT, "lib/session-data") + sep];
const SERVER_FILES = [resolve(SRC_ROOT, "lib/supabase.ts")];
const SERVER_SPECIFIERS = ["astro:env/server", "cloudflare:workers"];

describe("client/server import boundary", () => {
  const { parents, externals } = walkValueImports(listSourceModules("components"));

  it("walks the real component graph", () => {
    expect(parents.size).toBeGreaterThan(50);
  });

  it("never reaches server-only modules from a component", () => {
    const leaks = [...parents.keys()]
      .filter((file) => SERVER_FILES.includes(file) || SERVER_DIRECTORIES.some((dir) => file.startsWith(dir)))
      .map((file) => describeChain(parents, file));

    expect(leaks).toEqual([]);
  });

  it("never imports server-only virtual modules from a component", () => {
    const leaks = SERVER_SPECIFIERS.flatMap((specifier) => {
      const importer = externals.get(specifier);
      return importer ? [`${describeChain(parents, importer)} → ${specifier}`] : [];
    });

    expect(leaks).toEqual([]);
  });
});

/**
 * Graf importów wartości w `src/` dla testów granic klienta. Pomocnik, nie
 * test (vitest zbiera tylko `*.test.ts`): `modality-catalog.test.ts` pilnuje
 * promptów, `client-server-boundary.test.ts` modułów serwerowych.
 *
 * Liczy się to, co zostaje w wyemitowanym JS. Przy `verbatimModuleSyntax`
 * (astro/tsconfigs) znika tylko `import type` / `export type`; import, którego
 * wszystkie nazwy mają inline `type`, zostaje jako goły `import "…"` i nadal
 * ładuje moduł — więc liczy się jak import wartości.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

export const SRC_ROOT = resolve(__dirname, "../..");

const RESOLVABLE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];

/** Każdy moduł `.ts` / `.tsx` pod `src/<dir>` poza testami i ich pomocnikami. */
export function listSourceModules(dir: string) {
  return readdirSync(resolve(SRC_ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => resolve(entry.parentPath, entry.name))
    .filter((path) => !path.includes("__tests__"));
}

function isFile(path: string) {
  return existsSync(path) && statSync(path).isFile();
}

/** Plik w `src/` albo `null` dla pakietu i modułu wirtualnego (`astro:*`, `cloudflare:*`). */
function resolveSpecifier(fromFile: string, specifier: string) {
  let base: string;

  if (specifier.startsWith("@/")) {
    base = resolve(SRC_ROOT, specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    return null;
  }

  const candidates = [
    base,
    ...RESOLVABLE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...RESOLVABLE_EXTENSIONS.map((extension) => resolve(base, `index${extension}`)),
  ];

  return candidates.find((candidate) => isFile(candidate) && /\.(tsx?|m?js)$/.test(candidate)) ?? null;
}

function collectValueSpecifiers(filePath: string) {
  const source = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (!node.isTypeOnly) {
        specifiers.push(node.moduleSpecifier.text);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);

  return specifiers;
}

export interface ValueImportGraph {
  /** Osiągalne pliki `src/`; wartość wskazuje plik, z którego każdy przyszedł (`null` dla korzeni). */
  parents: Map<string, string | null>;
  /** Specyfikatory spoza `src/` (pakiety, `astro:*`, `cloudflare:*`) z pierwszym plikiem, który je importuje. */
  externals: Map<string, string>;
}

export function walkValueImports(roots: readonly string[]): ValueImportGraph {
  const parents = new Map<string, string | null>(roots.map((root) => [root, null]));
  const externals = new Map<string, string>();
  const queue = [...roots];

  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    for (const specifier of collectValueSpecifiers(file)) {
      const target = resolveSpecifier(file, specifier);

      if (target === null) {
        if (!externals.has(specifier)) {
          externals.set(specifier, file);
        }
      } else if (!parents.has(target)) {
        parents.set(target, file);
        queue.push(target);
      }
    }
  }

  return { parents, externals };
}

/** Łańcuch importów od korzenia do pliku, np. `components/A.tsx → lib/b.ts`. */
export function describeChain(parents: ValueImportGraph["parents"], file: string) {
  const chain: string[] = [];

  for (let current: string | null | undefined = file; current; current = parents.get(current)) {
    chain.unshift(relative(SRC_ROOT, current));
  }

  return chain.join(" → ");
}

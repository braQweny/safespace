/* eslint-disable @typescript-eslint/no-deprecated -- tseslint.config() is the only way to use extends; core defineConfig has incompatible API */
import { includeIgnoreFile } from "@eslint/config-helpers";
import eslint from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import eslintPluginAstro from "eslint-plugin-astro";
import pluginReact from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";
import eslintPluginReactHooks from "eslint-plugin-react-hooks";
import path from "node:path";
import tseslint from "typescript-eslint";

const gitignorePath = path.resolve(import.meta.dirname, ".gitignore");

const baseConfig = tseslint.config({
  extends: [eslint.configs.recommended, tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  rules: {
    "no-console": "warn",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      },
    ],
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
  },
});

// Build-time config files run in Node before any bundling, so they may read
// `process.env` even though nothing in `src/` is allowed to.
const buildConfigFilesConfig = tseslint.config({
  files: ["*.config.{js,mjs,ts}"],
  languageOptions: {
    globals: {
      process: "readonly",
    },
  },
});

const reactConfig = tseslint.config({
  files: ["**/*.{js,jsx,ts,tsx}"],
  extends: [pluginReact.configs.flat.recommended],
  languageOptions: {
    ...pluginReact.configs.flat.recommended.languageOptions,
    globals: {
      window: true,
      document: true,
    },
  },
  plugins: {
    "react-hooks": eslintPluginReactHooks,
    "react-compiler": reactCompiler,
  },
  settings: { react: { version: "detect" } },
  rules: {
    ...eslintPluginReactHooks.configs.recommended.rules,
    "react/react-in-jsx-scope": "off",
    "react-compiler/react-compiler": "error",
  },
});

const astroConfig = tseslint.config({
  files: ["**/*.astro"],
  rules: {
    "astro/no-set-html-directive": "error",
    "astro/no-unused-css-selector": "warn",
    "astro/prefer-class-list-directive": "warn",
  },
});

// `return Astro.redirect(...)` to idiomatyczny wczesny wyjątek strony, ale
// no-misused-promises przewraca się na takim `return`: astro-eslint-parser nie
// daje temu węzłowi rodzica, więc reguła rzuca zamiast sprawdzić. Wyłączona
// tylko dla stron — komponenty .astro nadal ją mają.
const astroPagesConfig = tseslint.config({
  files: ["src/pages/**/*.astro"],
  rules: {
    "@typescript-eslint/no-misused-promises": "off",
  },
});

export default tseslint.config(
  includeIgnoreFile(gitignorePath),
  baseConfig,
  buildConfigFilesConfig,
  reactConfig,
  eslintPluginAstro.configs["flat/recommended"],
  ...eslintPluginAstro.configs["flat/jsx-a11y-recommended"],
  astroConfig,
  astroPagesConfig,
  // The disposable PostgreSQL harness runs as native Node JavaScript. Keep
  // syntax/style checks; the application's type-aware TS rules do not apply.
  { ...tseslint.configs.disableTypeChecked, files: ["tests/**/*.mjs"] },
  eslintPluginPrettier,
);

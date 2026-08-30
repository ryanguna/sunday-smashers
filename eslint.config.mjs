import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored worker bundles or generated output, if ever added.
    // Throwaway verification scripts at the repo root (see .gitignore); they
    // are scratch work, not source, and must never gate a lint run.
    "*.cjs",
    "shots/**",
  ]),
  {
    // Match the file scope `eslint-config-next` registers the react-hooks
    // plugin for. Without this the rule below would also apply to files the
    // plugin was never loaded for (e.g. a stray `.cjs` script), which makes
    // ESLint fail to resolve the plugin and abort the whole run.
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      // Data-loading effects legitimately call setState after an await; the
      // React Compiler lint is too strict for that pattern here.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;

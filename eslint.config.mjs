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
    // Vendored maplibre worker bundle, copied in by `predev`/`prebuild`.
    "public/maplibre/**",
  ]),
  {
    rules: {
      // Data-loading effects legitimately call setState after an await; the
      // React Compiler lint is too strict for that pattern here.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;

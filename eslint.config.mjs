import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The redesign prototype is a single-file reference, not actual app
    // code. Components attach to window globals (Babel inline scripts),
    // so ESLint can't statically resolve them.
    "redesign/**",
  ]),
]);

export default eslintConfig;

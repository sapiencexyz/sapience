import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {files: ["**/*.{js,mjs,cjs,ts}"]},
  {languageOptions: { globals: globals.node }},
  {ignores: ["src/graphql/types/generated.ts", "src/generated/**/*"]},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
];
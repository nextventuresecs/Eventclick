// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Server lint configuration.
 *
 * `lint` here used to be `echo "(lint not configured yet)" && exit 0`, so the
 * pipeline's lint stage has only ever checked the client — the backend has
 * never been linted at all.
 *
 * Deliberately the *recommended* (non type-checked) preset rather than
 * `strictTypeChecked`. Type-aware linting on a codebase this size produces a
 * backlog measured in hundreds of findings, most of them stylistic, and the
 * result is a rule set someone disables wholesale. `tsc --noEmit` already runs
 * in the same CI stage and covers the type-correctness half.
 *
 * No formatting rules: the codebase has an established style and this must not
 * turn into a whitespace rewrite.
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "drizzle/**", "node_modules/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    rules: {
      // Unused variables are worth catching; the underscore prefix is the
      // codebase's existing convention for a deliberately unused binding
      // (see the `_next` parameters throughout middleware).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // `any` is used deliberately in a few places where a third-party type is
      // wrong or absent, each with a comment. Warn so new ones are visible in
      // review without failing the build on the existing set.
      "@typescript-eslint/no-explicit-any": "warn",
      // Drizzle's query builders are thenable objects; this rule misreads them.
      "@typescript-eslint/no-misused-promises": "off",
    },
  },
  {
    // Test files legitimately reach for `any` and partial fixtures.
    files: ["**/__tests__/**", "**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);

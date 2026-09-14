// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import path from "node:path";

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
const SRC = path.join(import.meta.dirname, "src");
const OPS = path.join(SRC, "ops");
const OPS_ENTRY = path.join(SRC, "ops-entry");

const within = (dir, file) => file === dir || file.startsWith(dir + path.sep);
const stripExt = (file) => file.replace(/\.(d\.)?[cm]?[jt]sx?$/, "");
const isOpsFile = (file) => within(OPS, file) || stripExt(file) === OPS_ENTRY;
const isTestFile = (file) => file.split(path.sep).includes("__tests__") || /\.test\.ts$/.test(file);

/**
 * The Ops Console boundary (#147), resolved by path rather than by import
 * string: `../middleware/x` is tenant code from `src/ops/app.ts` but ops code
 * from `src/ops/routes/x.ts`, which `no-restricted-imports` cannot tell apart.
 *
 * - ops-server (`src/ops/**`, `src/ops-entry.ts`) may import from the rest of
 *   `src/` only `utils/redact` and, type-only, `db/schema/*`. Everything else
 *   there (the tenant `db` proxy, `config/env`, the tenant logger, routes,
 *   middleware, services) either holds tenant credentials or exits without them.
 * - tenant code may not import ops code. Tests may, to exercise ops-server.
 */
const opsBoundary = {
  meta: { type: "problem", schema: [] },
  create(context) {
    const file = path.resolve(context.filename);
    const ops = isOpsFile(file);
    if (!ops && (!within(SRC, file) || isTestFile(file))) return {};

    const check = (node, importKind) => {
      const spec = node.source && node.source.value;
      if (typeof spec !== "string" || !spec.startsWith(".")) return;
      const target = stripExt(path.resolve(path.dirname(file), spec));
      if (!within(SRC, target)) return;

      if (ops) {
        if (isOpsFile(target)) return;
        if (target === path.join(SRC, "utils", "redact")) return;
        if (importKind === "type" && within(path.join(SRC, "db", "schema"), target)) return;
        context.report({
          node: node.source,
          message: `ops-server may not import tenant module '${spec}' (allowed: utils/redact, type-only db/schema).`,
        });
      } else if (isOpsFile(target)) {
        context.report({ node: node.source, message: `Tenant code may not import ops-server module '${spec}'.` });
      }
    };

    return {
      ImportDeclaration: (node) => check(node, node.importKind),
      ExportNamedDeclaration: (node) => check(node, node.exportKind),
      ExportAllDeclaration: (node) => check(node, node.exportKind),
      ImportExpression: (node) => check(node, "value"),
    };
  },
};

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
    plugins: { local: { rules: { "ops-boundary": opsBoundary } } },
    rules: { "local/ops-boundary": "error" },
  },
  {
    // respondAudited (ops/audit.ts) is the only writer under src/ops.
    files: ["src/ops/**/*.ts", "src/ops-entry.ts"],
    ignores: ["src/ops/audit.ts", "src/ops/**/__tests__/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: String.raw`Literal[value=/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i], TemplateElement[value.raw=/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i]`,
          message: "Only src/ops/audit.ts may write; ops-server reads through maintainer_ro_login.",
        },
      ],
    },
  },
  {
    // Test files legitimately reach for `any` and partial fixtures.
    files: ["**/__tests__/**", "**/*.test.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Server data must never persist in the browser (#147).
      "no-restricted-globals": [
        "error",
        { name: "localStorage", message: "Ops Console keeps no server data in browser storage." },
        { name: "sessionStorage", message: "Ops Console keeps no server data in browser storage." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "localStorage", message: "Ops Console keeps no server data in browser storage." },
        { object: "window", property: "sessionStorage", message: "Ops Console keeps no server data in browser storage." },
      ],
    },
  },
);

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
    },
  },
  {
    files: ["src/cli/**/*.ts", "src/cli/**/*.js"],
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: ["dist/", "node_modules/", "templates/", "tests/fixtures/", "scripts/"],
  },
);

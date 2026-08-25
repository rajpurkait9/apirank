import eslint from "@eslint/js";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**", "bun.lock", "**/*.{ts,tsx}"],
  },
  eslint.configs.recommended,
];

export default config;

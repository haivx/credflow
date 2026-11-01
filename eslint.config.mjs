// ESLint 9 flat config.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/dist/**",
      "data/**",
      "docs/**",
      "**/next-env.d.ts",
    ],
  },
  ...tseslint.configs.strict,
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  // Module Nest là class rỗng có decorator `@Module`.
  {
    files: ["apps/api/**/*.ts"],
    rules: {
      "@typescript-eslint/no-extraneous-class": [
        "error",
        { allowWithDecorator: true },
      ],
    },
  },
  // CLAUDE.md: TypeScript strict, không `any`.
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
  prettier,
);

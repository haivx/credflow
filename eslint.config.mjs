// ESLint 9 flat config.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";

// Guardrail (docs/agent/GUARDRAILS.md). Block A3 đặt sau block A5 và gộp cả hai mảng selector,
// vì `no-restricted-syntax` ở block sau thay hẳn options của block trước, không cộng dồn.
const A5_NO_DATE = [
  {
    selector: "NewExpression[callee.name='Date']",
    message: "A5: ngày lịch là chuỗi YYYY-MM-DD, không tạo Date",
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: "A5: ngày lịch là chuỗi YYYY-MM-DD, không tạo Date",
  },
  {
    selector:
      "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "A5: không đọc đồng hồ trong packages/*, truyền asOf vào",
  },
];

const A3_PURE = [
  {
    selector:
      "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: "A3: rule engine phải deterministic, không dùng Math.random()",
  },
  // MemberExpression (không phải CallExpression): bắt cả `const log = console.log`.
  {
    selector: "MemberExpression[object.name='console']",
    message: "A3: rule engine không log; trả kết quả qua RuleResult",
  },
];

const PACKAGES_IGNORES = ["**/*.test.ts", "packages/rules/src/config.ts"];

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
  // Lint có type-check: bắt promise bị bỏ quên (không await, không .catch).
  {
    files: [
      "apps/api/src/**/*.ts",
      "apps/api/scripts/**/*.ts",
      "apps/api/test/**/*.ts",
      "packages/*/src/**/*.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: { "@typescript-eslint/no-floating-promises": "error" },
  },
  // A9: eslint-disable phải có lý do, không có disable thừa.
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  comments.recommended,
  {
    rules: { "@eslint-community/eslint-comments/require-description": "error" },
  },
  // A5: packages/* không tạo Date.
  {
    files: ["packages/*/src/**/*.ts"],
    ignores: PACKAGES_IGNORES,
    rules: { "no-restricted-syntax": ["error", ...A5_NO_DATE] },
  },
  // A3: rule engine là hàm thuần. Đọc file chỉ ở config.ts.
  {
    files: ["packages/rules/src/**/*.ts"],
    ignores: PACKAGES_IGNORES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["fs", "path", "yaml", "drizzle-orm", "@credflow/api"].map(
            (name) => ({
              name,
              message:
                "A3: rule engine không I/O, không framework; đọc file ở config.ts hoặc phía gọi",
            }),
          ),
          patterns: [
            {
              group: [
                "node:*",
                "@nestjs/*",
                "drizzle-orm/*",
                "@credflow/api/*",
              ],
              message:
                "A3: rule engine không I/O, không framework; đọc file ở config.ts hoặc phía gọi",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "A3: rule engine không gọi mạng" },
        {
          name: "process",
          message: "A3: rule engine không đọc env/process, truyền qua input",
        },
      ],
      "no-restricted-syntax": ["error", ...A5_NO_DATE, ...A3_PURE],
    },
  },
  // CLAUDE.md: TypeScript strict, không `any`.
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
  prettier,
);

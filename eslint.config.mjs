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

// A14: gờ chính là formatErrorForLog + test (apps/api/test/error-log.int-spec.ts), lint chỉ là lớp phụ.
const A14_NO_STACK = {
  selector: "MemberExpression[property.name='stack']",
  message: "A14: không đọc .stack trực tiếp, dùng formatErrorForLog",
};
const A14_NO_SQL_RAW = {
  selector: "MemberExpression[object.name='sql'][property.name='raw']",
  message:
    "A14: không dùng sql.raw; an toàn của log và chống SQL injection đều dựa trên query có tham số",
};
// A11: status chỉ đổi qua DocumentStatusService. Chỉ bắt object viết trực tiếp trong .set()/.values();
// `const patch = { status }; .set(patch)` vẫn lọt (plan 12).
const A11_NO_STATUS_WRITE = {
  selector:
    "CallExpression[callee.property.name=/^(set|values)$/] > ObjectExpression > Property[key.name='status']",
  message:
    "A11: chỉ đổi status qua DocumentStatusService.transition (documents/document-status.service.ts)",
};
const API_SRC = ["apps/api/src/**/*.ts"];
const API_SRC_IGNORES = ["**/*.spec.ts"];

const PACKAGES_IGNORES = ["**/*.test.ts", "packages/rules/src/config.ts"];

// A2: dữ liệu từ ngoài phải qua Zod. MemberExpression: bắt cả `const p = JSON.parse`.
const A2_NO_JSON_PARSE = {
  selector: "MemberExpression[object.name='JSON'][property.name='parse']",
  message: "A2: dùng parseJson(schema, text) từ @credflow/contracts",
};
const TEST_FILES = ["**/*.test.ts", "**/*.spec.ts", "apps/api/test/**"];

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
  // A2: giá trị `any` không lan được. Chỉ ở nơi có typed lint; web, eval, synth làm khi có code thật.
  {
    files: ["apps/api/src/**/*.ts", "packages/*/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
    },
  },
  // A2: `req.body as Foo` lọt qua 5 rule trên. Test được ép kiểu để dựng dữ liệu giả.
  {
    files: ["apps/api/src/**/*.ts", "packages/*/src/**/*.ts"],
    ignores: TEST_FILES,
    rules: { "@typescript-eslint/no-unsafe-type-assertion": "error" },
  },
  // A2: JSON.parse chỉ ở helper. Các block `no-restricted-syntax` đặt sau thay hẳn options
  // của block này, nên block nào cũng phải gộp A2_NO_JSON_PARSE. Miễn test và tools/lint (.mjs).
  {
    files: [
      "apps/**/*.{ts,tsx}",
      "packages/*/src/**/*.ts",
      "eval/src/**/*.ts",
      "tools/synth/src/**/*.ts",
    ],
    ignores: TEST_FILES,
    rules: { "no-restricted-syntax": ["error", A2_NO_JSON_PARSE] },
  },
  // A5: packages/* không tạo Date.
  {
    files: ["packages/*/src/**/*.ts"],
    ignores: PACKAGES_IGNORES,
    rules: {
      "no-restricted-syntax": ["error", ...A5_NO_DATE, A2_NO_JSON_PARSE],
    },
  },
  // Helper duy nhất được gọi JSON.parse.
  {
    files: ["packages/contracts/src/parse-json.ts"],
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
      "no-restricted-syntax": [
        "error",
        ...A5_NO_DATE,
        ...A3_PURE,
        A2_NO_JSON_PARSE,
      ],
    },
  },
  // A10: LLM chỉ đọc và trích xuất. Module LLM không chạm được rule, routing, nơi ghi status, DB.
  {
    files: ["apps/api/src/llm/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@credflow/rules",
              message:
                "A10: LLM không gọi rule hay routing, code ra quyết định",
            },
          ],
          patterns: [
            {
              group: [
                "**/documents/*",
                "**/db/*",
                "**/pipeline/*",
                "**/worker/*",
              ],
              message:
                "A10: LLM chỉ trả dữ liệu, không ghi status, không đọc DB, không biết pipeline",
            },
          ],
        },
      ],
    },
  },
  // A10: chỉ module LLM được gọi SDK, để không có đường gọi LLM nào lách qua ranh giới trên.
  {
    files: API_SRC,
    ignores: ["apps/api/src/llm/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@anthropic-ai/sdk", "@anthropic-ai/sdk/*"],
              message: "A10: chỉ apps/api/src/llm được import SDK của LLM",
            },
          ],
        },
      ],
    },
  },
  // A14: log lỗi DB an toàn. Hai miễn trừ dưới đặt sau và thay hẳn options của block này.
  {
    files: API_SRC,
    ignores: API_SRC_IGNORES,
    rules: {
      "no-console": "error",
      "no-restricted-syntax": [
        "error",
        A14_NO_STACK,
        A14_NO_SQL_RAW,
        A2_NO_JSON_PARSE,
        A11_NO_STATUS_WRITE,
      ],
    },
  },
  // Helper duy nhất được đọc .stack.
  {
    files: ["apps/api/src/common/pg-error.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        A14_NO_SQL_RAW,
        A2_NO_JSON_PARSE,
        A11_NO_STATUS_WRITE,
      ],
    },
  },
  // DDL không nhận tham số $1; schema.ts chỉ ghép hằng số từ contracts.
  {
    files: ["apps/api/src/db/schema.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        A14_NO_STACK,
        A2_NO_JSON_PARSE,
        A11_NO_STATUS_WRITE,
      ],
    },
  },
  // Nơi duy nhất được ghi status (A11).
  {
    files: ["apps/api/src/documents/document-status.service.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        A14_NO_STACK,
        A14_NO_SQL_RAW,
        A2_NO_JSON_PARSE,
      ],
    },
  },
  // CLAUDE.md: TypeScript strict, không `any`.
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
  prettier,
);

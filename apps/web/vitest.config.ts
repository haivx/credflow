import { defineConfig } from "vitest/config";

// Plan 28: chỉ test hàm thuần trong app/_lib (môi trường node, không render component).
// Giao diện được kiểm ở L3 bằng .claude/skills/verify/scripts/ui.mts.
export default defineConfig({
  test: { root: "./", include: ["app/**/*.test.ts"], environment: "node" },
});

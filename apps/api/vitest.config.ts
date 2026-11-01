import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC biên dịch test để giữ decorator metadata, thiếu nó thì DI của Nest không chạy (ADR 0001).
export default defineConfig({
  test: { root: "./", include: ["src/**/*.spec.ts"] },
  plugins: [swc.vite({ module: { type: "es6" } })],
});

import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";
import { testEnv } from "./test/test-env.js";

// Integration test (make test-int): app Nest thật trên Postgres test + Redis.
// Các file dùng chung một DB nên chạy lần lượt (fileParallelism: false).
export default defineConfig({
  test: {
    root: "./",
    include: ["test/**/*.int-spec.ts"],
    env: testEnv,
    globalSetup: ["./test/global-setup.ts"],
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});

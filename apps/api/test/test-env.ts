import { tmpdir } from "node:os";
import { join } from "node:path";

// Env cho integration test: Postgres test (service db-test, cổng 5433) và Redis của docker compose.
// Biến môi trường của process thắng .env trong ConfigModule, nên các giá trị này đè được .env dev.
export const testEnv = {
  DATABASE_URL: "postgres://credflow:credflow@localhost:5433/credflow_test",
  // Khoá giả đè .env: `make test-int` không thể gọi API thật và tốn tiền; CI không cần khoá.
  ANTHROPIC_API_KEY: "test-key-khong-goi-that",
  // Redis db 1: dùng chung db 0 thì worker dev đang chạy sẽ ăn mất job của test.
  REDIS_URL: "redis://localhost:6379/1",
  // File upload của test ghi vào thư mục tạm của hệ điều hành, không đụng data/ của dev.
  DATA_DIR: join(tmpdir(), "credflow-int-test"),
  // Giới hạn nhỏ để test 413 không phải gửi 10 MB.
  UPLOAD_MAX_BYTES: "65536",
};

// Test xoá dữ liệu (TRUNCATE): chỉ cho chạy trên database tên credflow_test.
export function assertTestDatabase(url: string) {
  const name = new URL(url).pathname.slice(1);
  if (name !== "credflow_test") {
    throw new Error(
      `Integration test chỉ chạy trên database credflow_test, đang trỏ tới "${name}"`,
    );
  }
}

// Env cho integration test: Postgres test (service db-test, cổng 5433) và Redis của docker compose.
// Biến môi trường của process thắng .env trong ConfigModule, nên các giá trị này đè được .env dev.
export const testEnv = {
  DATABASE_URL: "postgres://credflow:credflow@localhost:5433/credflow_test",
  REDIS_URL: "redis://localhost:6379",
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

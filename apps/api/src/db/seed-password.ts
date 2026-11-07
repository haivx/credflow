/**
 * Mật khẩu dev chung cho user giả lập (ADR 0004). Chỉ được dùng khi database ở máy local.
 */
export const DEV_SEED_PASSWORD = "credflow-dev";

const MIN_REMOTE_LENGTH = 12;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * Chọn mật khẩu cho user seed (plan 33). Hàm thuần để test được.
 * - Database ở máy local (dev, test): không đặt `SEED_PASSWORD` thì dùng mật khẩu dev như trước.
 * - Database ở nơi khác (Railway, production): bắt buộc `SEED_PASSWORD`, khác mật khẩu dev,
 *   tối thiểu 12 ký tự. Mật khẩu dev nằm trong repo, ai đọc repo cũng biết.
 */
export function resolveSeedPassword(env: {
  DATABASE_URL: string;
  SEED_PASSWORD?: string | undefined;
}): string {
  const given = env.SEED_PASSWORD;
  const local = LOCAL_HOSTS.has(new URL(env.DATABASE_URL).hostname);
  if (local)
    return given === undefined || given === "" ? DEV_SEED_PASSWORD : given;

  if (given === undefined || given === "") {
    throw new Error(
      "Database không ở máy local: đặt SEED_PASSWORD (mật khẩu riêng cho user demo) rồi chạy lại.",
    );
  }
  if (given === DEV_SEED_PASSWORD) {
    throw new Error(
      `Không dùng mật khẩu dev "${DEV_SEED_PASSWORD}" cho database không ở máy local: nó nằm trong repo.`,
    );
  }
  if (given.length < MIN_REMOTE_LENGTH) {
    throw new Error(
      `SEED_PASSWORD cho database không ở máy local phải dài ít nhất ${String(MIN_REMOTE_LENGTH)} ký tự.`,
    );
  }
  return given;
}

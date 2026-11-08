import { inArray } from "drizzle-orm";
import { hashPassword } from "../auth/password.js";
import type { Db } from "./db.provider.js";
import { sessions, users } from "./schema.js";

/**
 * Đặt lại mật khẩu cho một danh sách email (plan 34, dùng cho tài khoản demo).
 * Không xoá user: user có `review_actions` thì không xoá được (khoá ngoại), và lịch sử duyệt
 * phải giữ. Xoá session của các user đó để mọi nơi đang đăng nhập phải đăng nhập lại.
 * Trả số user được đổi mật khẩu. Email không tồn tại thì bỏ qua.
 */
export async function resetPasswords(
  db: Db,
  emails: readonly string[],
  password: string,
): Promise<number> {
  if (emails.length === 0) return 0;
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(users)
      .set({ passwordHash })
      .where(inArray(users.email, [...emails]))
      .returning({ id: users.id });
    const ids = updated.map((u) => u.id);
    if (ids.length > 0) {
      await tx.delete(sessions).where(inArray(sessions.userId, ids));
    }
    return ids.length;
  });
}

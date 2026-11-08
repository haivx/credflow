import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Mã hoá bí mật nhỏ (khoá Anthropic của admin, plan 35, ADR 0014) bằng AES-256-GCM.
 * GCM vừa giữ bí mật vừa phát hiện bản mã bị sửa (auth tag). Mỗi lần mã hoá dùng IV ngẫu nhiên
 * 12 byte, nên cùng một khoá mã hoá hai lần ra hai chuỗi khác nhau.
 * Định dạng: `v1:<iv>:<tag>:<ciphertext>` (base64url); `v1` để sau này đổi thuật toán vẫn đọc được bản cũ.
 */
const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;

/** Khoá chủ từ env `SETTINGS_ENCRYPTION_KEY` (base64 của đúng 32 byte, tạo bằng `openssl rand -base64 32`). */
export function parseMasterKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `SETTINGS_ENCRYPTION_KEY phải là base64 của đúng ${String(KEY_BYTES)} byte (đang ${String(key.length)} byte)`,
    );
  }
  return key;
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url"),
    )
    .join(":");
}

/** Ném lỗi khi sai định dạng, sai khoá chủ hoặc bản mã bị sửa. Message không chứa dữ liệu bí mật. */
export function decryptSecret(token: string, key: Buffer): string {
  const [version, ivB64, tagB64, ctB64, ...rest] = token.split(":");
  if (
    version !== VERSION ||
    ivB64 === undefined ||
    tagB64 === undefined ||
    ctB64 === undefined ||
    rest.length > 0
  ) {
    throw new Error("Bản mã không đúng định dạng");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

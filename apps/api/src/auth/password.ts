import {
  randomBytes,
  scrypt,
  type ScryptOptions,
  timingSafeEqual,
} from "node:crypto";

// Hash mật khẩu bằng scrypt có sẵn trong Node (ADR 0004).
// Chậm có chủ đích (~16 MB RAM, vài chục ms mỗi lần) để đoán mật khẩu hàng loạt tốn kém.
// Tham số lưu trong chuỗi: sau này tăng N thì hash cũ vẫn verify được.
const PARAMS = { N: 16384, r: 8, p: 1 } as const;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

/** scrypt dạng Promise. Bản callback chạy trên threadpool của libuv nên không chặn event loop. */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Trả `scrypt$N$r$p$<salt hex>$<hash hex>`. Mỗi lần gọi một salt mới: cùng mật khẩu ra hash khác nhau. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scryptAsync(plain, salt, KEY_BYTES, PARAMS);
  const { N, r, p } = PARAMS;
  return ["scrypt", N, r, p, salt.toString("hex"), key.toString("hex")].join(
    "$",
  );
}

/** Chuỗi lưu sai format hoặc tham số hỏng thì trả false, không throw: coi như sai mật khẩu. */
export async function verifyPassword(
  plain: string,
  stored: string,
): Promise<boolean> {
  const [algo, n, r, p, saltHex, hashHex, ...rest] = stored.split("$");
  if (
    algo !== "scrypt" ||
    rest.length > 0 ||
    saltHex === undefined ||
    hashHex === undefined ||
    !/^[0-9a-f]+$/.test(saltHex) ||
    !/^([0-9a-f]{2})+$/.test(hashHex)
  ) {
    return false;
  }
  const expected = Buffer.from(hashHex, "hex");
  try {
    const actual = await scryptAsync(
      plain,
      Buffer.from(saltHex, "hex"),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p) },
    );
    // So sánh thời gian cố định: `===` dừng ở byte khác đầu tiên, lộ thông tin qua thời gian phản hồi.
    return timingSafeEqual(actual, expected);
  } catch {
    // N không phải luỹ thừa của 2, r/p không hợp lệ...
    return false;
  }
}

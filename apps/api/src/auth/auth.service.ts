import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AuthUser, LoginRequest } from "@credflow/contracts";
import { and, eq, gt, sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { Env } from "../config/env.schema.js";
import { type Db, DB } from "../db/db.provider.js";
import { sessions, users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "./password.js";
import { hashSessionToken, newSessionToken } from "./session-token.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Chỉ các cột của AuthUser: password_hash không bao giờ ra khỏi service. */
const authUserColumns = {
  id: users.id,
  email: users.email,
  role: users.role,
  staffId: users.staffId,
};

export interface LoginResult {
  user: AuthUser;
  token: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  // Hash giả để email không tồn tại cũng tốn thời gian scrypt như email có thật.
  private readonly dummyHash = hashPassword("credflow-timing-dummy");

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Sai email hoặc sai mật khẩu đều trả null (controller trả cùng một lỗi 401). */
  async login(input: LoginRequest): Promise<LoginResult | null> {
    const email = input.email.toLowerCase();
    const [row] = await this.db
      .select({ ...authUserColumns, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email));

    if (row === undefined) {
      await verifyPassword(input.password, await this.dummyHash);
      return null;
    }
    if (!(await verifyPassword(input.password, row.passwordHash))) {
      return null;
    }

    const token = newSessionToken();
    const ttlDays = this.config.get("SESSION_TTL_DAYS", { infer: true });
    const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
    await this.db.insert(sessions).values({
      id: ulid(),
      userId: row.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });

    const user: AuthUser = {
      id: row.id,
      email: row.email,
      role: row.role,
      staffId: row.staffId,
    };
    return { user, token, expiresAt };
  }

  /** Xoá session: cookie cũ hết hiệu lực ngay, kể cả khi trình duyệt chưa xoá cookie. */
  async logout(token: string): Promise<void> {
    await this.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(token)));
  }

  /** Token không khớp session nào, hoặc session đã hết hạn → undefined. */
  async findUserBySessionToken(token: string): Promise<AuthUser | undefined> {
    const [row] = await this.db
      .select(authUserColumns)
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, hashSessionToken(token)),
          // So với giờ của Postgres, không phải giờ của process Node.
          gt(sessions.expiresAt, sql`now()`),
        ),
      );
    return row;
  }
}

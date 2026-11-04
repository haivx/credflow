import { type ArgumentsHost } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AllExceptionsFilter } from "../src/common/all-exceptions.filter.js";
import { documents, staff } from "../src/db/schema.js";
import {
  createTestDb,
  makeProcessedDocument,
  makeStaff,
  truncateAll,
} from "./db.js";
import { testEnv } from "./test-env.js";

// Guardrail A14 (plan 12e): lỗi thật từ Postgres thật qua Drizzle thật đưa vào filter thật,
// rồi kiểm chuỗi thực sự ghi ra stdout/stderr, không mock Logger.

const SENSITIVE = "SAMPLE-Jane-Q-Doe";

describe("log lỗi DB không chứa giá trị của dòng (integration)", () => {
  const { db, close } = createTestDb();
  const owner = makeStaff();
  let written: string;

  beforeEach(async () => {
    await truncateAll(db);
    await db.insert(staff).values(owner);
    written = "";
    const capture = (chunk: string | Uint8Array) => {
      written += String(chunk);
      return true;
    };
    vi.spyOn(process.stdout, "write").mockImplementation(capture);
    vi.spyOn(process.stderr, "write").mockImplementation(capture);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await close();
  });

  /** Chạy một query phải lỗi, trả về lỗi thật. */
  async function failure(query: () => Promise<unknown>): Promise<Error> {
    const error = await query().then(
      () => undefined,
      (err: unknown) => err,
    );
    if (!(error instanceof Error)) throw new Error("query phải lỗi");
    return error;
  }

  function runFilter(exception: unknown) {
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const host = {
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ArgumentsHost;
    new AllExceptionsFilter().catch(exception, host);
    return {
      status: res.status.mock.calls[0]?.[0] as number,
      body: JSON.stringify(res.json.mock.calls[0]?.[0]),
    };
  }

  const failedInsert = (fileName: string) =>
    failure(() =>
      db
        .insert(documents)
        .values(
          makeProcessedDocument(owner.id, "failed", { error: null, fileName }),
        ),
    );

  it("CHECK nổ: log có mã, constraint, SQL $1; không có giá trị", async () => {
    const error = await failedInsert(`${SENSITIVE}.png`);
    // Điều kiện để test có nghĩa: giá trị thật sự nằm trong lỗi gốc.
    expect(error.message).toContain(SENSITIVE);

    const { status, body } = runFilter(error);

    expect(written).not.toContain(SENSITIVE);
    expect(written).not.toContain("params:");
    expect(written).toContain("23514");
    expect(written).toContain("documents_failed_has_error");
    expect(written).toContain("$1");
    expect(status).toBe(500);
    expect(body).toContain("INTERNAL");
    expect(body).not.toContain(SENSITIVE);
    expect(body).not.toContain("insert into");
  });

  it("giá trị chứa xuống dòng, giả dạng stack frame: vẫn không lộ", async () => {
    const error = await failedInsert(`x\n    at ${SENSITIVE} (fake.js:1:1)`);
    expect(error.message).toContain(SENSITIVE);

    runFilter(error);

    expect(written).not.toContain(SENSITIVE);
  });

  it("lỗi pg có giá trị trong message (22P02): không lộ", async () => {
    const error = await failure(() =>
      db.execute(sql`SELECT ${SENSITIVE}::int`),
    );
    expect(error.cause).toMatchObject({ code: "22P02" });
    expect((error.cause as Error).message).toContain(SENSITIVE);

    runFilter(error);

    expect(written).not.toContain(SENSITIVE);
    expect(written).toContain("22P02");
  });

  it("lỗi pg trần, không qua Drizzle: không lộ", async () => {
    const pool = new Pool({ connectionString: testEnv.DATABASE_URL });
    try {
      const error = await failure(() =>
        pool.query("SELECT $1::int", [SENSITIVE]),
      );
      expect(error.message).toContain(SENSITIVE);

      runFilter(error);

      expect(written).not.toContain(SENSITIVE);
      expect(written).toContain("22P02");
    } finally {
      await pool.end();
    }
  });

  it("mất kết nối (không có SQLSTATE): không lộ, có causeCode", async () => {
    // Cổng 1 không có gì lắng nghe.
    const pool = new Pool({
      connectionString: "postgres://nobody:nobody@127.0.0.1:1/nothing",
    });
    try {
      const closed = drizzle({ client: pool });
      const error = await failure(() =>
        closed.execute(sql`SELECT ${SENSITIVE}`),
      );
      expect(error.message).toContain(SENSITIVE);

      runFilter(error);

      expect(written).not.toContain(SENSITIVE);
      expect(written).toContain("ECONNREFUSED");
    } finally {
      await pool.end();
    }
  });

  it("lỗi không phải DB: giữ message và stack để debug", () => {
    runFilter(new Error("boom-khong-phai-db"));

    expect(written).toContain("boom-khong-phai-db");
    expect(written).toContain("error-log.int-spec");
  });
});

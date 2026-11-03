import { Test, TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { staff } from "../src/db/schema.js";

describe("GET /staff integrations", () => {
  let app: INestApplication;
  let db: Db;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    db = app.get(DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE staff`);
    await db.insert(staff).values([
      {
        id: "01TEST0000000000000000000B",
        legalName: "Zara Quinlan",
        role: "nurse",
        region: "north",
      },
      {
        id: "01TEST0000000000000000000X",
        legalName: "Avery Holt",
        role: "nurse",
        region: "north",
      },
    ]);
  });
  it("Postgres và Redis đều chạy thì 200", async () => {
    const res = await request(app.getHttpServer()).get("/ready");
    expect(res.status).toBe(200);
  });
});

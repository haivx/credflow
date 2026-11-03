import { Test, TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApiError, StaffProfile } from "@credflow/contracts";
import { AppModule } from "../src/app.module.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { staff } from "../src/db/schema.js";
import { truncateAll } from "./db.js";

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
    await truncateAll(db);
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

  it("GET /staff trả mọi staff, sắp theo tên", async () => {
    const res = await request(app.getHttpServer()).get("/staff");

    expect(res.status).toBe(200);
    const body = StaffProfile.array().parse(res.body);
    expect(body.map((s) => s.legalName)).toEqual([
      "Avery Holt",
      "Zara Quinlan",
    ]);
  });

  it("GET /staff?role=&region= lọc đúng", async () => {
    await db.insert(staff).values({
      id: "01TEST0000000000000000000C",
      legalName: "Bea Marlow",
      role: "caregiver",
      region: "south",
    });

    const res = await request(app.getHttpServer())
      .get("/staff")
      .query({ role: "caregiver", region: "south" });

    expect(res.status).toBe(200);
    expect(
      StaffProfile.array()
        .parse(res.body)
        .map((s) => s.id),
    ).toEqual(["01TEST0000000000000000000C"]);
  });

  it.each([
    ["role rỗng", "/staff?role="],
    ["key lạ", "/staff?foo=1"],
  ])("%s → 400 VALIDATION_FAILED", async (_name, url) => {
    const res = await request(app.getHttpServer()).get(url);

    expect(res.status).toBe(400);
    const body = ApiError.parse(res.body);
    expect(body.code).toBe("VALIDATION_FAILED");
    expect(body.details).toBeInstanceOf(Array);
  });

  it("GET /staff/:id có thì 200", async () => {
    const res = await request(app.getHttpServer()).get(
      "/staff/01TEST0000000000000000000B",
    );

    expect(res.status).toBe(200);
    expect(StaffProfile.parse(res.body).legalName).toBe("Zara Quinlan");
  });

  it("GET /staff/:id không có thì 404 NOT_FOUND", async () => {
    const res = await request(app.getHttpServer()).get("/staff/khong-co");

    expect(res.status).toBe(404);
    expect(ApiError.parse(res.body).code).toBe("NOT_FOUND");
  });

  it("route không tồn tại cũng trả format ApiError", async () => {
    const res = await request(app.getHttpServer()).get("/khong-co-route");

    expect(res.status).toBe(404);
    expect(ApiError.parse(res.body).code).toBe("NOT_FOUND");
  });
});

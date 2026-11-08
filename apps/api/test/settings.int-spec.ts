import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ApiError, LlmSettingsView } from "@credflow/contracts";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { type Db, DB } from "../src/db/db.provider.js";
import { appSettings } from "../src/db/schema.js";
import {
  LLM_KEY_VALIDATOR,
  type LlmKeyValidator,
} from "../src/llm/key-validator.js";
import {
  LlmSettingsError,
  LlmSettingsService,
} from "../src/settings/llm-settings.service.js";
import { loginAs } from "./auth.js";
import { truncateAll } from "./db.js";

// Plan 35: admin đặt khoá Anthropic riêng. Bộ kiểm khoá thật gọi Anthropic, test thay bằng bản giả.
const GOOD_KEY = "sk-ant-api03-khoa-gia-dung-cho-test-wxyz";
const BAD_KEY = "sk-ant-api03-bad-khoa-gia-bi-tu-choi-0000";
const fakeValidator: LlmKeyValidator = {
  validate: (apiKey) =>
    Promise.resolve(apiKey.includes("bad") ? "invalid" : "ok"),
};

describe("/settings/llm (plan 35)", () => {
  let app: INestApplication;
  let db: Db;
  let admin: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(LLM_KEY_VALIDATOR)
      .useValue(fakeValidator)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    db = app.get(DB);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(db);
    admin = await loginAs(app, db, "admin");
  });

  const http = () => request(app.getHttpServer());
  const put = (body: object, cookie = admin) =>
    http().put("/settings/llm").set("Cookie", cookie).send(body);

  it("mặc định: khoá hệ thống, Haiku 5.5, khoá chủ đã cấu hình", async () => {
    const res = await http().get("/settings/llm").set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(LlmSettingsView.parse(res.body)).toEqual({
      source: "default",
      model: "claude-haiku-5-5",
      keyLast4: null,
      allowedModels: ["claude-haiku-5-5"],
      encryptionConfigured: true,
      updatedAt: null,
    });
  });

  it("lưu khoá hợp lệ: trả 4 ký tự cuối, không trả khoá; DB chỉ có bản mã", async () => {
    const res = await put({ model: "claude-haiku-5-5", apiKey: GOOD_KEY });
    expect(res.status).toBe(200);
    const view = LlmSettingsView.parse(res.body);
    expect(view.source).toBe("custom");
    expect(view.keyLast4).toBe("wxyz");
    expect(JSON.stringify(res.body)).not.toContain("sk-ant");

    const [row] = await db.select().from(appSettings);
    expect(row?.apiKeyCiphertext).toMatch(/^v1:/);
    expect(row?.apiKeyCiphertext).not.toContain(GOOD_KEY);

    const again = await http().get("/settings/llm").set("Cookie", admin);
    expect(JSON.stringify(again.body)).not.toContain("sk-ant");
  });

  it("khoá bị Anthropic từ chối → 400, cấu hình giữ nguyên", async () => {
    await put({ model: "claude-haiku-5-5", apiKey: GOOD_KEY });
    const res = await put({ model: "claude-haiku-5-5", apiKey: BAD_KEY });
    expect(res.status).toBe(400);
    expect(ApiError.parse(res.body).code).toBe("VALIDATION_FAILED");
    const view = LlmSettingsView.parse(
      (await http().get("/settings/llm").set("Cookie", admin)).body,
    );
    expect(view.keyLast4).toBe("wxyz");
  });

  it("model ngoài danh sách / khoá sai định dạng → 400", async () => {
    expect((await put({ model: "claude-opus-5-5" })).status).toBe(400);
    expect(
      (await put({ model: "claude-haiku-5-5", apiKey: " sk-ant-x" })).status,
    ).toBe(400);
  });

  it("DELETE khoá → về mặc định", async () => {
    await put({ model: "claude-haiku-5-5", apiKey: GOOD_KEY });
    const res = await http().delete("/settings/llm/key").set("Cookie", admin);
    expect(res.status).toBe(200);
    expect(LlmSettingsView.parse(res.body).source).toBe("default");
  });

  it("staff và reviewer không được đọc hay sửa → 403", async () => {
    for (const role of ["staff", "reviewer"] as const) {
      const cookie = await loginAs(app, db, role);
      expect(
        (await http().get("/settings/llm").set("Cookie", cookie)).status,
      ).toBe(403);
      expect(
        (await put({ model: "claude-haiku-5-5", apiKey: GOOD_KEY }, cookie))
          .status,
      ).toBe(403);
      expect(
        (await http().delete("/settings/llm/key").set("Cookie", cookie)).status,
      ).toBe(403);
    }
  });

  it("worker resolve: mặc định → không có khoá riêng; có khoá → giải mã đúng; bản mã hỏng → lỗi", async () => {
    const service = app.get(LlmSettingsService);
    expect(await service.resolve()).toEqual({
      source: "default",
      model: "claude-haiku-5-5",
    });

    await put({ model: "claude-haiku-5-5", apiKey: GOOD_KEY });
    expect(await service.resolve()).toEqual({
      source: "custom",
      model: "claude-haiku-5-5",
      apiKey: GOOD_KEY,
    });

    await db.update(appSettings).set({ apiKeyCiphertext: "v1:hong:hong:hong" });
    await expect(service.resolve()).rejects.toBeInstanceOf(LlmSettingsError);
  });
});

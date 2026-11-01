import { Test } from "@nestjs/testing";
import { describe, it, expect } from "vitest";
import { HealthController } from "./health.controller.js";
import { AppInfoService } from "../app-info/app-info.service.js";

async function createController(info: Record<string, string>) {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [
      { provide: AppInfoService, useValue: { getAppInfo: () => info } },
    ],
  }).compile();
  return module.get(HealthController);
}

describe("HealthController", () => {
  it("trả status ok kèm service/version từ AppInfoService", async () => {
    const controller = await createController({
      service: "api",
      version: "9.9.9-test",
    });
    const response = controller.health();
    expect(response).toEqual({
      status: "ok",
      service: "api",
      version: "9.9.9-test",
    });
  });
  it("status luôn là ok, AppInfoService không ghi đè được", async () => {
    const controller = await createController({
      service: "api",
      version: "9.9.9-test",
      status: "down",
    });
    expect(controller.health().status).toBe("ok");
  });
});

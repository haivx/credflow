import { Test } from "@nestjs/testing";
import { describe, it, expect } from "vitest";
import { StaffController } from "./staff.controller.js";
import { StaffService } from "./staff.service.js";
import { ZodError } from "zod";

async function createController(rows: unknown[]) {
  const module = await Test.createTestingModule({
    controllers: [StaffController],
    providers: [
      {
        provide: StaffService,
        useValue: { list: () => Promise.resolve(rows) },
      },
    ],
  }).compile();
  return module.get(StaffController);
}

const newStaffProfile = {
  id: "staff-1",
  legalName: "Michael Vk",
  aliases: ["A", "Anh A"],
  role: "caregiver",
  clientIds: ["client-1", "client-2"],
  region: "CA",
};

describe("StaffController", () => {
  it("return staff profiles", async () => {
    const controller = await createController([newStaffProfile]);
    const response = await controller.list({});
    expect(response).toEqual([newStaffProfile]);
  });
  it("return error if no region provided", async () => {
    const staffWithoutRegion = { ...newStaffProfile, region: undefined };
    const controller = await createController([staffWithoutRegion]);
    await expect(controller.list({})).rejects.toThrow(ZodError);
  });
});

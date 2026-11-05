import { BadRequestException } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants.js";
import { Test } from "@nestjs/testing";
import { describe, it, expect } from "vitest";
import { StaffController } from "./staff.controller.js";
import { StaffService } from "./staff.service.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import * as z from "zod";
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
  // Route luôn có `id` không rỗng nên HTTP không phân biệt được có pipe hay không: đọc metadata của Nest.
  it("@Param('id') đi qua ZodValidationPipe(Id)", () => {
    const metadata: unknown = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StaffController,
      "getById",
    );
    const args = z
      .record(
        z.string(),
        z.object({ data: z.unknown(), pipes: z.array(z.unknown()) }),
      )
      .parse(metadata);
    const pipe = Object.values(args)
      .find((arg) => arg.data === "id")
      ?.pipes.find((p) => p instanceof ZodValidationPipe);

    expect(pipe).toBeInstanceOf(ZodValidationPipe);
    expect(() => (pipe as ZodValidationPipe<z.ZodType>).transform("")).toThrow(
      BadRequestException,
    );
  });

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

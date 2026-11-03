import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ApiError } from "@credflow/contracts";
import type * as z from "zod";

export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<T>
> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) {
      return parsed.data;
    }

    const body: ApiError = {
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      details: parsed.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    };
    throw new BadRequestException(body);
  }
}

import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from "@nestjs/common";
import { StaffListQuery, StaffProfile } from "@credflow/contracts";
import { Roles } from "../auth/decorators.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { StaffService } from "./staff.service.js";

// Hồ sơ staff chỉ cho người duyệt và admin xem (ADR 0004).
@Roles("reviewer", "admin")
@Controller("staff")
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(StaffListQuery)) query: StaffListQuery,
  ) {
    const rows = await this.staffService.list(query);
    return StaffProfile.array().parse(rows);
  }

  @Get(":id")
  async getById(@Param("id") id: string) {
    const row = await this.staffService.findById(id);
    if (row === undefined) {
      throw new NotFoundException(`Không tìm thấy staff ${id}`);
    }
    return StaffProfile.parse(row);
  }
}

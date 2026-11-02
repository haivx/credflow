import { Controller, Get } from "@nestjs/common";
import { StaffService } from "./staff.service.js";
import { StaffProfile } from "@credflow/contracts";

@Controller("staff")
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  async list() {
    const rows = await this.staffService.list();
    return StaffProfile.array().parse(rows);
  }
}

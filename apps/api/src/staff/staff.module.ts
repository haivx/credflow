import { Module } from "@nestjs/common";
import { StaffController } from "./staff.controller.js";
import { StaffService } from "./staff.service.js";
import { DbModule } from "../db/db.module.js";

@Module({
  imports: [DbModule],
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}

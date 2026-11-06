import { Module } from "@nestjs/common";
import { StaffController } from "./staff.controller.js";
import { StaffService } from "./staff.service.js";
import { DbModule } from "../db/db.module.js";
import { rulesConfigProvider } from "../rules/rules-config.provider.js";

@Module({
  imports: [DbModule],
  controllers: [StaffController],
  // Config rule để biết vai trò cần giấy gì (plan 26): API giờ cũng nạp config, sai thì không khởi động.
  providers: [StaffService, rulesConfigProvider],
})
export class StaffModule {}

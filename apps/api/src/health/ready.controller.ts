import { Controller, Get } from "@nestjs/common";
import { ReadyService } from "./ready.service.js";
import { ServiceUnavailableException } from "@nestjs/common";

@Controller("ready")
export class ReadyController {
  constructor(private readonly readyService: ReadyService) {}

  @Get()
  async ready() {
    const result = await this.readyService.check();
    if (result.status === "error") {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}

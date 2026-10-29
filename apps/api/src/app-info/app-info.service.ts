import { Injectable } from "@nestjs/common";

@Injectable()
export class AppInfoService {
  getAppInfo() {
    return { service: "api", version: "0.0.0" };
  }
}

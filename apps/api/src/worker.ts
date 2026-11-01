import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module.js";
import { AppInfoService } from "./app-info/app-info.service.js";

const ctx = await NestFactory.createApplicationContext(WorkerModule);

const appInfoService = ctx.get(AppInfoService);
const appInfo = appInfoService.getAppInfo();
console.log("worker started", appInfo);

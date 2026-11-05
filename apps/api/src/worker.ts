import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module.js";
import { AppInfoService } from "./app-info/app-info.service.js";

const ctx = await NestFactory.createApplicationContext(WorkerModule);
// SIGTERM/SIGINT → gọi onModuleDestroy: worker chờ job đang chạy xong rồi mới thoát.
ctx.enableShutdownHooks();

const appInfoService = ctx.get(AppInfoService);
const appInfo = appInfoService.getAppInfo();
new Logger("Worker").log(`worker started ${JSON.stringify(appInfo)}`);

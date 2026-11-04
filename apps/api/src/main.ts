import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.schema.js";
import { ConfigService } from "@nestjs/config";

const app = await NestFactory.create(AppModule);
const configService = app.get<ConfigService<Env, true>>(ConfigService);
const apiPort = configService.get("API_PORT", { infer: true });
const apiHost = configService.get("API_HOST", { infer: true });

await app.listen(apiPort, apiHost);
new Logger("Main").log(`api http://${apiHost}:${apiPort}`);

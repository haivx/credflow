import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const app = await NestFactory.create(AppModule);
await app.listen(8787, "127.0.0.1");
console.log("api http://127.0.0.1:8787");

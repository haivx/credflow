import { ConfigModuleOptions } from "@nestjs/config";
import path from "node:path";
import { appEnvSchema } from "./env.schema.js";

export const baseConfig: ConfigModuleOptions = {
  envFilePath: path.resolve(import.meta.dirname, "../../../../.env"),
  isGlobal: true,
  validationSchema: appEnvSchema,
};

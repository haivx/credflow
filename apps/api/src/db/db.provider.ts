import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema.js";
import { Pool } from "pg";
import { type FactoryProvider, Logger } from "@nestjs/common";

export const DB = Symbol("DB");
export type Db = NodePgDatabase<typeof schema> & { $client: Pool };

export const dbProvider = {
  provide: DB,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const newPool = new Pool({
      connectionString: config.get("DATABASE_URL", { infer: true }),
    });
    newPool.on("error", (err) => {
      new Logger("Db").error(`PostgreSQL pool error: ${err.message}`);
    });
    return drizzle({ client: newPool, schema });
  },
} satisfies FactoryProvider<Db>;

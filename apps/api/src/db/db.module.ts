import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { DB, dbProvider, type Db } from "./db.provider.js";

@Module({
  providers: [dbProvider],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onApplicationShutdown() {
    return this.db.$client.end();
  }
}

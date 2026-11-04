import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Schemas, type SchemaName } from "@credflow/contracts";

// Đọc fixture của packages/contracts và parse bằng đúng schema, để test không viết JSON tay:
// đổi contract → fixture không còn khớp → test dùng nó đỏ.

const FIXTURE_DIR = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "packages",
  "contracts",
  "fixtures",
);

type Parsed<N extends SchemaName> = ReturnType<(typeof Schemas)[N]["parse"]>;

export function contractFixture<N extends SchemaName>(
  name: N,
  caseName: string,
): Parsed<N> {
  const cases = JSON.parse(
    readFileSync(join(FIXTURE_DIR, `${name}.json`), "utf8"),
  ) as { name: string; data: unknown }[];
  const found = cases.find((c) => c.name === caseName);
  if (found === undefined) {
    throw new Error(`Không có fixture ${name}: "${caseName}"`);
  }
  return Schemas[name].parse(found.data) as Parsed<N>;
}

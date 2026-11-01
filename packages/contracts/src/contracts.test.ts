import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Extraction, Schemas, type SchemaName } from "./index.js";

const FIXTURE_DIR = join(import.meta.dirname, "..", "fixtures");

interface FixtureCase {
  name: string;
  data: unknown;
}

describe("fixtures", () => {
  const files = readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));

  it("có ít nhất một fixture", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const name = file.replace(/\.json$/, "") as SchemaName;
    const cases = JSON.parse(
      readFileSync(join(FIXTURE_DIR, file), "utf8"),
    ) as FixtureCase[];

    for (const c of cases) {
      it(`${name}: ${c.name}`, () => {
        const schema = Schemas[name];
        expect(schema, `không có schema ${name}`).toBeDefined();
        const result = schema.safeParse(c.data);
        expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      });
    }
  }
});

describe("Extraction", () => {
  it("từ chối docType không khớp với fields", () => {
    const bad = { docType: "tb_test", fields: { holderName: null } };
    expect(Extraction.safeParse(bad).success).toBe(false);
  });
});

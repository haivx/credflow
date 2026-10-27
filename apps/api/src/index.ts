import { serve } from "@hono/node-server";
import { Hono } from "hono";

// Khung API. Route upload, documents, review thêm ở P1/P4 (docs/roadmap.md).
const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok", service: "api", version: "0.0.0" }),
);

const port = Number(process.env.API_PORT ?? 8787);
// Chỉ lắng nghe localhost khi dev.
serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, (info) => {
  console.log(`api http://127.0.0.1:${info.port}`);
});

import * as z from "zod";
import { Id } from "./common.js";

/**
 * Dữ liệu job xử lý document, đọc từ Redis nên phải parse (A2).
 * Chỉ mang id: job data nằm dạng chữ thường trong Redis, không để dữ liệu cá nhân ở đó.
 */
export const ProcessDocumentJob = z
  .object({ documentId: Id })
  .meta({ id: "ProcessDocumentJob" });
export type ProcessDocumentJob = z.infer<typeof ProcessDocumentJob>;

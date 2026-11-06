"use client";

import { DocType, UploadDocumentResponse } from "@credflow/contracts";
import { type FormEvent, useRef, useState } from "react";
import { apiFetch } from "../_lib/api";
import { uploadErrorMessage } from "../_lib/status";

const DOC_TYPE_LABEL: Record<DocType, string> = {
  cpr_card: "Thẻ CPR",
  professional_license: "Giấy phép hành nghề",
  tb_test: "Xét nghiệm TB",
  background_check: "Kiểm tra lý lịch",
  vaccination_record: "Sổ tiêm chủng",
  unknown: "Không rõ",
};

/** "Không rõ" không phải lựa chọn của staff: để trống là không khai. */
const DECLARABLE = DocType.options.filter((type) => type !== "unknown");

export function UploadForm({
  onUploaded,
}: {
  onUploaded: (result: UploadDocumentResponse) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("");
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const file = fileInput.current?.files?.[0];
    if (file === undefined) {
      setMessage({ kind: "error", text: "Chọn một file trước." });
      return;
    }
    const form = new FormData();
    if (docType !== "") form.append("declaredDocType", docType);
    form.append("file", file);

    setBusy(true);
    setMessage(null);
    const res = await apiFetch("/documents", UploadDocumentResponse, {
      method: "POST",
      body: form,
    });
    setBusy(false);
    if (!res.ok) {
      setMessage({
        kind: "error",
        text: uploadErrorMessage(res.error.code, res.error.message),
      });
      return;
    }
    setMessage({
      kind: "ok",
      text: res.data.duplicate
        ? "Bạn đã nộp file này rồi: hiện giấy cũ."
        : "Đã nhận file, đang xử lý.",
    });
    if (fileInput.current !== null) fileInput.current.value = "";
    onUploaded(res.data);
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      data-testid="upload-form"
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <select
        value={docType}
        onChange={(e) => setDocType(e.target.value)}
        data-testid="upload-doc-type"
      >
        <option value="">Loại giấy (không bắt buộc)</option>
        {DECLARABLE.map((type) => (
          <option key={type} value={type}>
            {DOC_TYPE_LABEL[type]}
          </option>
        ))}
      </select>
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        data-testid="upload-file"
      />
      <button type="submit" disabled={busy} data-testid="upload-submit">
        {busy ? "Đang tải lên…" : "Nộp giấy"}
      </button>
      {message !== null && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          data-testid="upload-message"
          style={{ color: message.kind === "error" ? "#b00020" : "#1b5e20" }}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}

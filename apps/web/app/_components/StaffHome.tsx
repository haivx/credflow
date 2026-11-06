"use client";

import {
  DocumentList,
  type DocumentView,
  type UploadDocumentResponse,
} from "@credflow/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../_lib/api";
import { isInProgress, statusLabel } from "../_lib/status";
import { DocumentDetail } from "./DocumentDetail";
import { UploadForm } from "./UploadForm";

/** Hỏi lại mỗi 2 giây khi còn giấy đang xử lý; dừng sau 2 phút (plan 17). */
const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_MS = 120_000;

const cell = { border: "1px solid #ccc", padding: "4px 8px" } as const;

export function StaffHome() {
  const [docs, setDocs] = useState<DocumentView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pollStartedAt, setPollStartedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await apiFetch("/documents", DocumentList);
    if (res.ok) {
      setDocs(res.data.items);
      setLoadError(null);
    } else {
      setLoadError(res.error.message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pending = docs?.some((d) => isInProgress(d.status)) ?? false;
  useEffect(() => {
    if (!pending || Date.now() - pollStartedAt > POLL_MAX_MS) return;
    const timer = setTimeout(() => void load(), POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [docs, pending, pollStartedAt, load]);

  function handleUploaded(result: UploadDocumentResponse) {
    setSelectedId(result.documentId);
    setPollStartedAt(Date.now());
    void load();
  }

  const selected = docs?.find((d) => d.id === selectedId);

  return (
    <div>
      <h2>Nộp giấy</h2>
      <UploadForm onUploaded={handleUploaded} />

      <h2 style={{ marginTop: 24 }}>Giấy của tôi</h2>
      {loadError !== null && (
        <p role="alert" style={{ color: "#b00020" }}>
          Không tải được danh sách: {loadError}
        </p>
      )}
      {docs === null ? (
        <p>Đang tải…</p>
      ) : docs.length === 0 ? (
        <p data-testid="documents-empty">Chưa nộp giấy nào.</p>
      ) : (
        <table
          data-testid="documents-table"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th style={cell}>File</th>
              <th style={cell}>Nộp lúc (UTC)</th>
              <th style={cell}>Trạng thái</th>
              <th style={cell}>Lý do</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id} data-testid={`document-row-${doc.id}`}>
                <td style={cell}>{doc.fileName}</td>
                <td style={cell}>
                  {doc.createdAt.slice(0, 16).replace("T", " ")}
                </td>
                <td style={cell} data-testid="document-status">
                  {statusLabel(doc.status)}
                </td>
                <td style={cell}>{doc.routing?.reasons.join(", ") ?? ""}</td>
                <td style={cell}>
                  <button type="button" onClick={() => setSelectedId(doc.id)}>
                    Xem kết quả
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected !== undefined && <DocumentDetail doc={selected} />}
    </div>
  );
}

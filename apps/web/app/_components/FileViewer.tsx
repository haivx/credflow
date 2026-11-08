"use client";

import { useEffect, useState } from "react";

/**
 * File gốc của giấy cho người duyệt (plan 28). PDF trong iframe (trình xem của trình duyệt), ảnh trong
 * img. Nguồn là API stream file đã kiểm quyền (plan 27); chưa phóng to, xoay, highlight `box` (P5).
 */
export function FileViewer({
  documentId,
  mimeType,
  fileName,
}: {
  documentId: string;
  mimeType: string;
  fileName: string;
}) {
  const src = `/api/review/documents/${documentId}/file`;
  // Plan 34: file của giấy quá FILE_RETENTION_DAYS ngày bị xoá, API trả 404. <iframe> không báo
  // lỗi khi PDF 404, nên hỏi trước bằng HEAD rồi mới hiện khung xem.
  const [state, setState] = useState<"checking" | "ok" | "missing">("checking");
  useEffect(() => {
    let cancelled = false;
    void fetch(src, { method: "HEAD", credentials: "same-origin" })
      .then((res) => {
        if (!cancelled) setState(res.status === 404 ? "missing" : "ok");
      })
      .catch(() => {
        // Lỗi mạng: cứ hiện khung xem, trình duyệt sẽ tự báo.
        if (!cancelled) setState("ok");
      });
    return () => {
      cancelled = true;
    };
  }, [src]);
  const frame = {
    width: "100%",
    border: "1px solid #ccc",
    background: "#f6f6f6",
  } as const;

  // Chưa biết file còn hay không thì chưa gắn <img>/<iframe>, tránh tải file 404 hai lần.
  if (state === "checking") {
    return (
      <div data-testid="file-viewer">
        <p style={{ ...frame, padding: 16, margin: 0 }}>Đang tải file…</p>
      </div>
    );
  }

  if (state === "missing") {
    return (
      <div data-testid="file-viewer">
        <p
          data-testid="file-deleted"
          role="status"
          style={{ ...frame, padding: 16, margin: 0 }}
        >
          File đã được xoá sau 3 ngày theo chính sách lưu giữ của bản demo. Kết
          quả đọc và lịch sử duyệt vẫn còn.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="file-viewer">
      {mimeType === "application/pdf" ? (
        <iframe
          src={src}
          title={fileName}
          style={{ ...frame, height: 720 }}
          data-testid="file-pdf"
        />
      ) : (
        <img
          src={src}
          alt={`Giấy ${fileName}`}
          style={{ ...frame, height: "auto" }}
          data-testid="file-image"
        />
      )}
      <p style={{ margin: "4px 0", fontSize: 12, color: "#555" }}>
        <a href={src} target="_blank" rel="noreferrer">
          Mở file ở tab mới
        </a>
      </p>
    </div>
  );
}

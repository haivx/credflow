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
  const frame = {
    width: "100%",
    border: "1px solid #ccc",
    background: "#f6f6f6",
  } as const;

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

"use client";

import {
  type ApiError,
  DecisionResponse,
  PreviewResponse,
  ReviewDocumentDetail,
  type ReviewActionKind,
  ReviewQueuePage,
} from "@credflow/contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../_lib/api";
import {
  buildCorrections,
  editableFields,
  failedFieldRefs,
  failedRules,
  parseQueueFilter,
  queueParams,
} from "../_lib/review";
import { statusLabel } from "../_lib/status";
import { FieldEditor } from "./FieldEditor";
import { FileViewer } from "./FileViewer";

const ACTION_LABEL: Record<ReviewActionKind, string> = {
  approve: "Duyệt",
  reject: "Từ chối",
  request_reupload: "Yêu cầu nộp lại",
};

/** Câu lỗi cho người duyệt; VALIDATION_FAILED thì liệt kê từng chỗ sai. */
function errorText(error: ApiError): string {
  if (Array.isArray(error.details)) {
    const parts = error.details.map((d: unknown) =>
      typeof d === "object" && d !== null && "message" in d
        ? String(d.message)
        : "",
    );
    return parts.filter((p) => p !== "").join("; ") || error.message;
  }
  return error.message;
}

type Notice = { kind: "error" | "conflict"; text: string } | null;

/**
 * S3 màn duyệt một giấy (plan 28): file bên trái; rule không qua, trường sửa inline, ghi chú và 3 nút
 * bên phải. Rời ô đã sửa → preview chấm lại; quyết định xong → mở ca kế cùng bộ lọc.
 */
export function ReviewScreen({ documentId }: { documentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterKey = queueParams(parseQueueFilter(searchParams));

  const [detail, setDetail] = useState<ReviewDocumentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Đếm lần gọi preview: response về muộn của lần cũ thì bỏ, không đè kết quả mới.
  const previewSeq = useRef(0);
  const lastPreviewed = useRef("[]");

  const load = useCallback(async () => {
    const res = await apiFetch(
      `/review/documents/${documentId}`,
      ReviewDocumentDetail,
    );
    if (res.ok) {
      setDetail(res.data);
      setLoadError(null);
    } else {
      setLoadError(res.error.message);
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const doc = detail?.document;
  const extraction = doc?.extraction;
  const fields = useMemo(
    () => (extraction === undefined ? [] : editableFields(extraction)),
    [extraction],
  );
  const corrections = useMemo(
    () => (extraction === undefined ? [] : buildCorrections(extraction, edits)),
    [extraction, edits],
  );
  const rules = preview?.ruleResults ?? doc?.ruleResults ?? [];
  const failed = failedRules(rules);
  const pendingReview = doc?.status === "needs_review";

  async function runPreview() {
    if (!pendingReview) return;
    const key = JSON.stringify(corrections);
    if (key === lastPreviewed.current) return;
    lastPreviewed.current = key;
    const seq = ++previewSeq.current;
    if (corrections.length === 0) {
      setPreview(null);
      setPreviewError(null);
      return;
    }
    const res = await apiFetch(
      `/review/documents/${documentId}/preview`,
      PreviewResponse,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ corrections }),
      },
    );
    if (seq !== previewSeq.current) return;
    if (res.ok) {
      setPreview(res.data);
      setPreviewError(null);
    } else {
      setPreviewError(errorText(res.error));
    }
  }

  async function decide(action: ReviewActionKind) {
    if (doc === undefined) return;
    setBusy(true);
    setNotice(null);
    const trimmed = note.trim();
    const res = await apiFetch(
      `/review/documents/${documentId}/decision`,
      DecisionResponse,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          version: doc.version,
          corrections,
          ...(trimmed === "" ? {} : { note: trimmed }),
        }),
      },
    );
    if (!res.ok) {
      setBusy(false);
      setNotice(
        res.status === 409
          ? {
              kind: "conflict",
              text: "Ca này đã thay đổi (có người khác xử lý hoặc hệ thống chấm lại). Tải lại để xem bản mới; chỗ bạn sửa vẫn giữ trên màn.",
            }
          : { kind: "error", text: errorText(res.error) },
      );
      return;
    }
    await openNext();
  }

  /** Lấy lại ca đầu hàng chờ từ API theo đúng bộ lọc (danh sách đã tải có thể đã cũ). */
  async function openNext() {
    const params = new URLSearchParams(filterKey);
    params.set("limit", "1");
    const next = await apiFetch(
      `/review/queue?${params.toString()}`,
      ReviewQueuePage,
    );
    const nextId = next.ok ? next.data.items[0]?.id : undefined;
    if (nextId !== undefined) {
      router.push(
        filterKey === ""
          ? `/review/${nextId}`
          : `/review/${nextId}?${filterKey}`,
      );
    } else {
      const back = new URLSearchParams(filterKey);
      back.set("done", "1");
      router.push(`/review?${back.toString()}`);
    }
  }

  if (loadError !== null) {
    return (
      <p role="alert" style={{ color: "#b00020" }}>
        Không tải được giấy: {loadError}
      </p>
    );
  }
  if (detail === null || doc === undefined) return <p>Đang tải…</p>;

  const noteMissing = note.trim() === "";

  return (
    <div>
      <p style={{ margin: "8px 0" }}>
        <a
          href={filterKey === "" ? "/review" : `/review?${filterKey}`}
          data-testid="back-to-queue"
        >
          ← Hàng chờ
        </a>
      </p>
      <h2 style={{ margin: "8px 0" }}>
        {detail.staff.legalName} · {doc.fileName} ·{" "}
        <span data-testid="review-status">{statusLabel(doc.status)}</span>
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 24,
          alignItems: "start",
        }}
      >
        <FileViewer
          documentId={doc.id}
          mimeType={doc.mimeType}
          fileName={doc.fileName}
        />

        <div>
          {doc.routing !== undefined && doc.routing.reasons.length > 0 && (
            <p data-testid="routing-reasons" style={{ marginTop: 0 }}>
              Lý do vào hàng chờ: <code>{doc.routing.reasons.join(", ")}</code>
              {doc.routing.reasons.includes("NO_RULES_EVALUATED") &&
                " (hệ thống chưa có rule cho loại giấy này, người duyệt tự kiểm)"}
            </p>
          )}
          <section data-testid="failed-rules">
            <h3 style={{ marginTop: 0 }}>
              Rule không qua{" "}
              <span style={{ fontSize: 13, fontWeight: "normal" }}>
                (
                {(preview?.asOf ?? doc.asOf) === undefined
                  ? "chưa chấm"
                  : `chấm ngày ${preview?.asOf ?? doc.asOf ?? ""}`}
                {preview !== null ? ", theo chỗ đã sửa" : ""})
              </span>
            </h3>
            {failed.length === 0 ? (
              <p data-testid="no-failed-rules">
                {rules.length === 0
                  ? "Chưa có rule nào được chấm cho giấy này."
                  : "Mọi rule đều qua."}
              </p>
            ) : (
              <ul style={{ paddingLeft: 20 }}>
                {failed.map((r) => (
                  <li key={r.code} data-testid={`failed-rule-${r.code}`}>
                    <code>{r.code}</code>
                    {r.severity === "info" ? " (thông tin)" : ""}: {r.message}
                  </li>
                ))}
              </ul>
            )}
            {previewError !== null && (
              <p
                role="alert"
                data-testid="preview-error"
                style={{ color: "#b00020" }}
              >
                Không chấm lại được: {previewError}
              </p>
            )}
          </section>

          <h3>Trường đã trích xuất</h3>
          {fields.length === 0 ? (
            <p>Giấy chưa có kết quả trích xuất.</p>
          ) : (
            <FieldEditor
              fields={fields}
              edits={edits}
              flagged={failedFieldRefs(rules)}
              readOnly={!pendingReview}
              onEdit={(name, value) =>
                setEdits((prev) => ({ ...prev, [name]: value }))
              }
              onCommit={() => void runPreview()}
            />
          )}

          {pendingReview ? (
            <section style={{ marginTop: 16 }} data-testid="decision-panel">
              <label style={{ display: "block" }}>
                Ghi chú (bắt buộc khi từ chối hoặc yêu cầu nộp lại; nhân viên sẽ
                thấy)
                <textarea
                  data-testid="decision-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  style={{ width: "100%", boxSizing: "border-box" }}
                />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {(Object.keys(ACTION_LABEL) as ReviewActionKind[]).map(
                  (action) => (
                    <button
                      key={action}
                      type="button"
                      data-testid={`decide-${action}`}
                      disabled={busy || (action !== "approve" && noteMissing)}
                      onClick={() => void decide(action)}
                    >
                      {ACTION_LABEL[action]}
                    </button>
                  ),
                )}
              </div>
              {noteMissing && (
                <p style={{ fontSize: 13, color: "#555" }}>
                  Ghi lý do để bật nút Từ chối và Yêu cầu nộp lại.
                </p>
              )}
              {corrections.length > 0 && (
                <p style={{ fontSize: 13 }} data-testid="corrections-count">
                  {corrections.length} trường đã sửa sẽ được lưu cùng quyết
                  định.
                </p>
              )}
            </section>
          ) : (
            <p data-testid="read-only" style={{ marginTop: 16 }}>
              Ca này không còn chờ duyệt: chỉ xem.
            </p>
          )}

          {notice !== null && (
            <div
              role="alert"
              data-testid={`notice-${notice.kind}`}
              style={{
                marginTop: 12,
                padding: 8,
                border: "1px solid #b00020",
                color: "#b00020",
              }}
            >
              {notice.text}
              {notice.kind === "conflict" && (
                <>
                  {" "}
                  <button
                    type="button"
                    data-testid="reload"
                    onClick={() => {
                      setNotice(null);
                      void load();
                    }}
                  >
                    Tải lại
                  </button>
                </>
              )}
            </div>
          )}

          <h3>Lịch sử duyệt</h3>
          {detail.reviewActions.length === 0 ? (
            <p>Chưa có.</p>
          ) : (
            <ul data-testid="review-history" style={{ paddingLeft: 20 }}>
              {detail.reviewActions.map((a) => (
                <li key={a.id}>
                  {a.createdAt.slice(0, 16).replace("T", " ")}:{" "}
                  {ACTION_LABEL[a.action]}
                  {a.note !== undefined ? `: ${a.note}` : ""}
                  {a.corrections.length > 0
                    ? ` (sửa ${a.corrections.map((c) => c.fieldPath).join(", ")})`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

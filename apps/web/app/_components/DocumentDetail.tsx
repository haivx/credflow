import type { DocumentView } from "@credflow/contracts";
import { statusLabel } from "../_lib/status";

const cell = { border: "1px solid #ccc", padding: "4px 8px" } as const;

/** Kết quả thô của một giấy (P1): đủ để kiểm pipeline, chưa phải màn duyệt (P4). */
export function DocumentDetail({ doc }: { doc: DocumentView }) {
  const fields =
    doc.extraction === undefined ? [] : Object.entries(doc.extraction.fields);

  return (
    <section data-testid="document-detail" style={{ marginTop: 24 }}>
      <h3>
        {doc.fileName}:{" "}
        <span data-testid="detail-status">{statusLabel(doc.status)}</span>
      </h3>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          gap: "4px 12px",
        }}
      >
        <dt>Trạng thái</dt>
        <dd>
          <code>{doc.status}</code>
        </dd>
        <dt>Phân loại</dt>
        <dd data-testid="detail-classification">
          {doc.classification === undefined
            ? "chưa có"
            : `${doc.classification.docType} (confidence ${doc.classification.confidence})`}
        </dd>
        <dt>Routing</dt>
        <dd data-testid="detail-routing">
          {doc.routing === undefined
            ? "chưa có"
            : `${doc.routing.decision}${doc.routing.reasons.length > 0 ? `: ${doc.routing.reasons.join(", ")}` : ""}`}
        </dd>
        <dt>Ngày chấm hạn (asOf)</dt>
        <dd data-testid="detail-as-of">{doc.asOf ?? "chưa có"}</dd>
        <dt>Versions</dt>
        <dd>
          <code>
            {doc.versions === undefined
              ? "chưa có"
              : JSON.stringify(doc.versions)}
          </code>
        </dd>
        <dt>Thời gian (ms)</dt>
        <dd>
          <code>{JSON.stringify(doc.timingMs)}</code>
        </dd>
        {doc.error !== undefined && (
          <>
            <dt>Lỗi</dt>
            <dd data-testid="detail-error">
              {doc.error.step}: {doc.error.message}
            </dd>
          </>
        )}
      </dl>

      <h4>Trích xuất</h4>
      {fields.length === 0 ? (
        <p>Chưa có.</p>
      ) : (
        <table
          data-testid="detail-fields"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th style={cell}>Trường</th>
              <th style={cell}>Giá trị</th>
              <th style={cell}>Confidence</th>
              <th style={cell}>Chữ gốc (quote)</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(([name, field]) => (
              <tr key={name}>
                <td style={cell}>{name}</td>
                <td style={cell}>
                  {field.value === null ? "—" : String(field.value)}
                </td>
                <td style={cell}>{field.confidence}</td>
                <td style={cell}>{field.evidence?.quote ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>Rule</h4>
      {doc.ruleResults.length === 0 ? (
        <p>Chưa chấm rule nào.</p>
      ) : (
        <table
          data-testid="detail-rules"
          style={{ borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th style={cell}>Mã</th>
              <th style={cell}>Mức</th>
              <th style={cell}>Kết quả</th>
              <th style={cell}>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {doc.ruleResults.map((rule) => (
              <tr key={rule.code} data-testid={`rule-${rule.code}`}>
                <td style={cell}>
                  <code>{rule.code}</code>
                </td>
                <td style={cell}>{rule.severity}</td>
                <td style={cell}>{rule.passed ? "qua" : "không qua"}</td>
                <td style={cell}>{rule.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

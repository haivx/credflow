import type { EditableField } from "../_lib/review";

const cell = { border: "1px solid #ccc", padding: "4px 8px" } as const;

/**
 * Các trường đã trích xuất, sửa inline (plan 28). Ô ngày là text `YYYY-MM-DD` (input type=date đổi
 * định dạng theo locale); enum là select có option từ contract. Rời ô thì `onCommit` để chấm lại.
 */
export function FieldEditor({
  fields,
  edits,
  flagged,
  readOnly,
  onEdit,
  onCommit,
}: {
  fields: EditableField[];
  edits: Readonly<Record<string, string>>;
  /** Trường bị rule không qua nhắc tới: tô đỏ. */
  flagged: ReadonlySet<string>;
  readOnly: boolean;
  onEdit: (name: string, value: string) => void;
  onCommit: () => void;
}) {
  return (
    <table
      data-testid="field-editor"
      style={{ borderCollapse: "collapse", width: "100%" }}
    >
      <thead>
        <tr>
          <th style={cell}>Trường</th>
          <th style={cell}>Giá trị</th>
          <th style={cell}>Tin cậy</th>
          <th style={cell}>Chữ gốc trên giấy</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((field) => {
          const current = edits[field.name] ?? field.value ?? "";
          const changed =
            edits[field.name] !== undefined &&
            edits[field.name]?.trim() !== (field.value ?? "");
          const isFlagged = flagged.has(field.name);
          const inputProps = {
            "data-testid": `field-${field.name}`,
            "aria-label": field.name,
            disabled: readOnly,
            onBlur: onCommit,
            style: {
              width: "100%",
              boxSizing: "border-box",
              background: changed ? "#fff8d6" : undefined,
            },
          } as const;
          return (
            <tr
              key={field.name}
              data-testid={`field-row-${field.name}`}
              data-flagged={isFlagged ? "true" : undefined}
              style={{ background: isFlagged ? "#fde7e9" : undefined }}
            >
              <td style={cell}>
                {field.name}
                {isFlagged && (
                  <span style={{ color: "#b00020" }} title="Rule không qua">
                    {" "}
                    ●
                  </span>
                )}
              </td>
              <td style={{ ...cell, minWidth: 200 }}>
                {field.kind === "enum" ? (
                  <select
                    {...inputProps}
                    value={current}
                    onChange={(e) => onEdit(field.name, e.target.value)}
                  >
                    <option value="">(trống)</option>
                    {field.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...inputProps}
                    type="text"
                    value={current}
                    placeholder={field.kind === "date" ? "YYYY-MM-DD" : ""}
                    onChange={(e) => onEdit(field.name, e.target.value)}
                  />
                )}
                {changed && (
                  <div style={{ fontSize: 12, color: "#555" }}>
                    Gốc: {field.value ?? "(trống)"}
                  </div>
                )}
              </td>
              <td style={cell}>{field.confidence.toFixed(2)}</td>
              <td style={cell} data-testid={`quote-${field.name}`}>
                {field.quote ?? <span style={{ color: "#888" }}>—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

import type { DocumentView } from "@credflow/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  docTypeLabel,
  reasonLabel,
  reviewerReason,
  statusLabel,
  statusTone,
} from "../_lib/status";

/**
 * Kết quả đọc một giấy cho staff (plan 17, giao diện plan 30). Thông tin cho người làm kỹ thuật
 * (mã rule, versions, thời gian) gom vào "Chi tiết kỹ thuật", đóng sẵn.
 */
export function DocumentDetail({ doc }: { doc: DocumentView }) {
  const fields =
    doc.extraction === undefined ? [] : Object.entries(doc.extraction.fields);
  const reason = reviewerReason(doc);

  return (
    <Card data-testid="document-detail">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <span className="break-all">{doc.fileName}</span>
          <Badge variant={statusTone(doc.status)} data-testid="detail-status">
            {statusLabel(doc.status)}
          </Badge>
        </CardTitle>
        <CardDescription>
          Nộp lúc {doc.createdAt.slice(0, 16).replace("T", " ")} (UTC)
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {reason !== null && (
          <Alert
            data-testid="detail-reviewer-reason"
            role="status"
            className="border-amber-200 bg-amber-50 text-amber-950"
          >
            <AlertTitle>Lý do người duyệt ghi</AlertTitle>
            <AlertDescription>{reason}</AlertDescription>
          </Alert>
        )}

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Loại giấy</dt>
          <dd data-testid="detail-classification">
            {doc.classification === undefined
              ? "Đang đọc…"
              : `${docTypeLabel[doc.classification.docType]} (độ chắc ${Math.round(doc.classification.confidence * 100)}%)`}
          </dd>
          <dt className="text-muted-foreground">Kết quả kiểm tự động</dt>
          <dd data-testid="detail-routing">
            {doc.routing === undefined
              ? "Chưa có"
              : doc.routing.decision === "auto_approve"
                ? "Đạt mọi điều kiện, tự duyệt"
                : `Chuyển người duyệt: ${doc.routing.reasons.map((c) => reasonLabel[c]).join("; ")}`}
          </dd>
          <dt className="text-muted-foreground">Ngày dùng để xét hạn</dt>
          <dd data-testid="detail-as-of">{doc.asOf ?? "Chưa có"}</dd>
          {doc.error !== undefined && (
            <>
              <dt className="text-muted-foreground">Lỗi</dt>
              <dd data-testid="detail-error" className="text-destructive">
                {doc.error.step}: {doc.error.message}
              </dd>
            </>
          )}
        </dl>

        <section className="grid gap-2">
          <h3 className="text-sm font-semibold">Thông tin đọc được</h3>
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">Chưa có.</p>
          ) : (
            <Table data-testid="detail-fields">
              <TableHeader>
                <TableRow>
                  <TableHead>Trường</TableHead>
                  <TableHead>Giá trị</TableHead>
                  <TableHead>Độ chắc</TableHead>
                  <TableHead>Chữ gốc trên giấy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map(([name, field]) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono text-xs">{name}</TableCell>
                    <TableCell>
                      {field.value === null ? "—" : String(field.value)}
                    </TableCell>
                    <TableCell>{Math.round(field.confidence * 100)}%</TableCell>
                    <TableCell className="text-muted-foreground">
                      {field.evidence?.quote ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <details className="rounded-lg border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Chi tiết kỹ thuật
          </summary>
          <div className="mt-3 grid gap-4">
            {doc.ruleResults.length === 0 ? (
              <p className="text-muted-foreground">Chưa chấm rule nào.</p>
            ) : (
              <Table data-testid="detail-rules">
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã</TableHead>
                    <TableHead>Mức</TableHead>
                    <TableHead>Kết quả</TableHead>
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {doc.ruleResults.map((rule) => (
                    <TableRow key={rule.code} data-testid={`rule-${rule.code}`}>
                      <TableCell className="font-mono text-xs">
                        {rule.code}
                      </TableCell>
                      <TableCell>{rule.severity}</TableCell>
                      <TableCell>{rule.passed ? "qua" : "không qua"}</TableCell>
                      <TableCell>{rule.message}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
              <dt className="text-muted-foreground">Trạng thái</dt>
              <dd className="font-mono text-xs">{doc.status}</dd>
              <dt className="text-muted-foreground">Versions</dt>
              <dd className="break-all font-mono text-xs">
                {doc.versions === undefined
                  ? "chưa có"
                  : JSON.stringify(doc.versions)}
              </dd>
              <dt className="text-muted-foreground">Thời gian (ms)</dt>
              <dd className="break-all font-mono text-xs">
                {JSON.stringify(doc.timingMs)}
              </dd>
            </dl>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

"use client";

import type { DocumentView, UploadDocumentResponse } from "@credflow/contracts";
import { ChevronRight, FileText } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useMyDocuments } from "../_lib/queries";
import { staffReason, statusLabel, statusTone } from "../_lib/status";
import { DocumentDetail } from "./DocumentDetail";
import { UploadForm } from "./UploadForm";

/** S1 (plan 17, giao diện plan 30): nộp giấy + danh sách giấy của tôi + chi tiết một giấy. */
export function StaffHome() {
  const docs = useMyDocuments();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function handleUploaded(result: UploadDocumentResponse) {
    setSelectedId(result.documentId);
    docs.restartPolling();
  }

  const items = docs.data;
  const selected = items?.find((d) => d.id === selectedId);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Nộp giấy</CardTitle>
          <CardDescription>
            Hệ thống tự đọc giấy; ca chưa chắc chắn sẽ có người duyệt xem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UploadForm onUploaded={handleUploaded} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Giấy của tôi</CardTitle>
        </CardHeader>
        <CardContent>
          {docs.isError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>
                Không tải được danh sách: {docs.error.message}
              </AlertDescription>
            </Alert>
          )}
          {items === undefined ? (
            docs.isPending && (
              <div className="grid gap-2" aria-busy="true">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <p className="sr-only">Đang tải…</p>
              </div>
            )
          ) : items.length === 0 ? (
            <p
              data-testid="documents-empty"
              className="py-6 text-center text-sm text-muted-foreground"
            >
              Chưa nộp giấy nào.
            </p>
          ) : (
            <DocumentList
              docs={items}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </CardContent>
      </Card>

      {selected !== undefined && <DocumentDetail doc={selected} />}
    </div>
  );
}

/**
 * Một danh sách cho mọi bề rộng: điện thoại là thẻ xếp dọc, từ `md` là lưới như bảng. Một DOM
 * duy nhất nên mỗi `data-testid` chỉ có một chỗ.
 */
function DocumentList({
  docs,
  selectedId,
  onSelect,
}: {
  docs: DocumentView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const grid =
    "md:grid md:grid-cols-[minmax(0,2fr)_9rem_9rem_minmax(0,3fr)_2rem] md:items-center md:gap-4";
  return (
    <div data-testid="documents-table" className="text-sm">
      <div
        aria-hidden="true"
        className={cn(
          "hidden border-b px-3 pb-2 font-medium text-muted-foreground",
          grid,
        )}
      >
        <span>File</span>
        <span>Nộp lúc (UTC)</span>
        <span>Trạng thái</span>
        <span>Lý do</span>
        <span />
      </div>
      <ul className="grid gap-2 md:gap-0" aria-label="Giấy của tôi">
        {docs.map((doc) => {
          const reason = staffReason(doc);
          return (
            <li key={doc.id} data-testid={`document-row-${doc.id}`}>
              <button
                type="button"
                onClick={() => onSelect(doc.id)}
                aria-current={doc.id === selectedId ? "true" : undefined}
                className={cn(
                  "w-full rounded-lg border px-3 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-none md:border-x-0 md:border-t-0",
                  doc.id === selectedId && "bg-accent",
                  grid,
                )}
              >
                <span className="flex min-w-0 items-center gap-2 font-medium">
                  <FileText
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="truncate">{doc.fileName}</span>
                </span>
                <span className="mt-1 block text-xs text-muted-foreground md:mt-0 md:text-sm">
                  {doc.createdAt.slice(0, 16).replace("T", " ")}
                </span>
                <span className="mt-2 block md:mt-0">
                  <Badge
                    variant={statusTone(doc.status)}
                    data-testid="document-status"
                  >
                    {statusLabel(doc.status)}
                  </Badge>
                </span>
                <span
                  data-testid="document-reason"
                  className="mt-1 block text-muted-foreground md:mt-0"
                >
                  {reason ?? ""}
                </span>
                <span className="hidden md:block">
                  <ChevronRight
                    className="size-4 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="sr-only">Xem kết quả</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

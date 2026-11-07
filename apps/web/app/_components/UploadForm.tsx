"use client";

import { DocType, type UploadDocumentResponse } from "@credflow/contracts";
import { FileUp, Loader2 } from "lucide-react";
import { type DragEvent, type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ApiRequestError, useUpload } from "../_lib/queries";
import { docTypeLabel, uploadErrorMessage } from "../_lib/status";

/** "Không nhận ra loại giấy" không phải lựa chọn của staff: để trống là không khai. */
const DECLARABLE = DocType.options.filter((type) => type !== "unknown");

const ACCEPT = "application/pdf,image/png,image/jpeg";

/**
 * Nộp một giấy (plan 17, giao diện plan 30): kéo thả hoặc bấm chọn file. Vùng kéo thả là
 * `<label>` bọc `<input type=file>` thật, nên bàn phím và trình duyệt điện thoại vẫn dùng được.
 */
export function UploadForm({
  onUploaded,
}: {
  onUploaded: (result: UploadDocumentResponse) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("");
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);
  const upload = useUpload();

  function pick(next: File | null) {
    setFile(next);
    setMessage(null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped === undefined) return;
    // Gán luôn vào input để form và input thật khớp nhau.
    if (fileInput.current !== null)
      fileInput.current.files = event.dataTransfer.files;
    pick(dropped);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (file === null) {
      setMessage({ kind: "error", text: "Chọn một file trước." });
      return;
    }
    const form = new FormData();
    if (docType !== "") form.append("declaredDocType", docType);
    form.append("file", file);

    setMessage(null);
    upload.mutate(form, {
      onSuccess: (result) => {
        const text = result.duplicate
          ? "Bạn đã nộp file này rồi: hiện giấy cũ."
          : "Đã nhận file, đang xử lý.";
        setMessage({ kind: "ok", text });
        toast.success(text);
        setFile(null);
        if (fileInput.current !== null) fileInput.current.value = "";
        onUploaded(result);
      },
      onError: (error) => {
        setMessage({
          kind: "error",
          text:
            error instanceof ApiRequestError
              ? uploadErrorMessage(error.error.code, error.error.message)
              : error.message,
        });
      },
    });
  }

  return (
    <form onSubmit={submit} data-testid="upload-form" className="grid gap-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
          "focus-within:ring-2 focus-within:ring-ring hover:bg-accent/50",
          dragging ? "border-primary bg-accent" : "border-input bg-background",
        )}
      >
        <FileUp className="size-8 text-primary" aria-hidden />
        {file === null ? (
          <>
            <span className="font-medium">
              Kéo file vào đây hoặc bấm để chọn
            </span>
            <span className="text-sm text-muted-foreground">
              PDF, PNG hoặc JPEG, tối đa 10 MB
            </span>
          </>
        ) : (
          <>
            <span className="max-w-full break-all font-medium">
              {file.name}
            </span>
            <span className="text-sm text-muted-foreground">
              {(file.size / 1024).toFixed(0)} KB · bấm để đổi file khác
            </span>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          data-testid="upload-file"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="upload-doc-type">Loại giấy (không bắt buộc)</Label>
          <select
            id="upload-doc-type"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            data-testid="upload-doc-type"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Để hệ thống tự nhận</option>
            {DECLARABLE.map((type) => (
              <option key={type} value={type}>
                {docTypeLabel[type]}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          disabled={upload.isPending}
          data-testid="upload-submit"
          className="sm:w-40"
        >
          {upload.isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden />
              Đang tải lên…
            </>
          ) : (
            "Nộp giấy"
          )}
        </Button>
      </div>

      {message !== null && (
        <Alert
          role={message.kind === "error" ? "alert" : "status"}
          variant={message.kind === "error" ? "destructive" : "default"}
          data-testid="upload-message"
          className={cn(
            message.kind === "ok" &&
              "border-emerald-200 bg-emerald-50 text-emerald-900",
          )}
        >
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

"use client";

import type { LlmModel } from "@credflow/contracts";
import { KeyRound, Loader2, RotateCcw } from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useClearLlmKey,
  useLlmSettings,
  useSaveLlmSettings,
} from "../_lib/queries";

const MODEL_LABEL: Record<LlmModel, string> = {
  "claude-haiku-5-5": "Claude Haiku 5.5 (nhanh, rẻ; đã qua eval)",
};

/**
 * Cài đặt LLM cho admin (plan 35, ADR 0014). Khoá chỉ đi một chiều: trình duyệt gửi lên, server
 * không bao giờ trả lại; màn chỉ thấy 4 ký tự cuối.
 */
export function SettingsScreen() {
  const settings = useLlmSettings();
  const save = useSaveLlmSettings();
  const clear = useClearLlmKey();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState<LlmModel | null>(null);

  if (settings.isPending) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (settings.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Không tải được cài đặt: {settings.error.message}
        </AlertDescription>
      </Alert>
    );
  }

  const view = settings.data;
  const chosenModel = model ?? view.model;
  const custom = view.source === "custom";
  const busy = save.isPending || clear.isPending;

  function submit(event: FormEvent) {
    event.preventDefault();
    const key = apiKey.trim();
    save.mutate(
      key === "" ? { model: chosenModel } : { model: chosenModel, apiKey: key },
      {
        onSuccess: () => {
          setApiKey("");
          toast.success(
            key === "" ? "Đã lưu model." : "Khoá hợp lệ, đã lưu (mã hoá).",
          );
        },
      },
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Áp dụng cho cả hệ thống. Chỉ quản trị viên thấy trang này.
        </p>
      </div>

      <Card data-testid="llm-settings">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
            Mô hình AI
            <Badge
              variant={custom ? "success" : "secondary"}
              data-testid="llm-source"
            >
              {custom
                ? `Khoá riêng ••••${view.keyLast4 ?? ""}`
                : "Khoá mặc định của hệ thống"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Mặc định CredFlow đọc giấy bằng khoá của chủ hệ thống (bản demo, có
            giới hạn số giấy mỗi ngày). Dán khoá Anthropic của bạn để tiền gọi
            AI tính vào tài khoản của bạn. Chỉ các model đã qua bộ kiểm tra độ
            chính xác (eval) mới được chọn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!view.encryptionConfigured && (
            <Alert className="mb-4" data-testid="llm-no-master-key">
              <AlertDescription>
                Server chưa cấu hình khoá chủ (SETTINGS_ENCRYPTION_KEY) nên chưa
                lưu được khoá riêng. Chế độ mặc định vẫn chạy bình thường.
              </AlertDescription>
            </Alert>
          )}
          <form onSubmit={submit} className="grid gap-4" data-testid="llm-form">
            <div className="grid gap-2">
              <Label htmlFor="llm-model">Model</Label>
              <select
                id="llm-model"
                value={chosenModel}
                onChange={(e) => setModel(e.target.value as LlmModel)}
                data-testid="llm-model"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {view.allowedModels.map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABEL[m]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Model mạnh hơn (Sonnet, Opus) sẽ được thêm sau khi chạy eval.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="llm-api-key">
                {custom ? "Thay khoá Anthropic" : "Khoá Anthropic của bạn"}
              </Label>
              <Input
                id="llm-api-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={!view.encryptionConfigured}
                data-testid="llm-api-key"
              />
              <p className="text-xs text-muted-foreground">
                Khoá được kiểm với Anthropic (không tốn tiền) rồi mã hoá trước
                khi lưu. Sau khi lưu, không ai xem lại được khoá đầy đủ.
              </p>
            </div>

            {save.error !== null && (
              <Alert variant="destructive" data-testid="llm-error">
                <AlertDescription>{save.error.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy} data-testid="llm-save">
                {save.isPending ? (
                  <Loader2 className="animate-spin" aria-hidden />
                ) : (
                  <KeyRound aria-hidden />
                )}
                Kiểm tra và lưu
              </Button>
              {custom && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    clear.mutate(undefined, {
                      onSuccess: () => {
                        setModel(null);
                        toast.success("Đã quay về khoá mặc định.");
                      },
                    })
                  }
                  data-testid="llm-clear"
                >
                  <RotateCcw aria-hidden />
                  Dùng lại khoá mặc định
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

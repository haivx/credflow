"use client";

import { Suspense } from "react";
import { AppShell } from "../../_components/AppShell";
import { ReviewScreen } from "../../_components/ReviewScreen";

/** S3 màn duyệt một giấy (plan 28). Giữ bộ lọc của hàng chờ trên URL để mở ca kế đúng bộ lọc. */
export default function ReviewDocumentPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <AppShell role="reviewer" wide>
      {() => (
        // data-legacy: style nền tạm cho màn chưa chuyển sang Tailwind (plan 30, bỏ ở plan 31).
        <div data-legacy>
          <Suspense fallback={<p>Đang tải…</p>}>
            {/* key: sang ca khác thì dựng lại màn, không giữ chỗ sửa của ca trước. */}
            <ReviewScreen key={params.id} documentId={params.id} />
          </Suspense>
        </div>
      )}
    </AppShell>
  );
}

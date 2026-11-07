"use client";

import { Suspense } from "react";
import { AppShell } from "../_components/AppShell";
import { ReviewQueue } from "../_components/ReviewQueue";

/** S2 hàng chờ duyệt (plan 28). Bộ lọc nằm trên URL: `?reason=&sort=`. */
export default function ReviewQueuePage() {
  return (
    <AppShell role="reviewer">
      {() => (
        // useSearchParams cần Suspense trong Next 14. data-legacy: style nền tạm (plan 30 → 31).
        <div data-legacy>
          <Suspense fallback={<p>Đang tải…</p>}>
            <ReviewQueue />
          </Suspense>
        </div>
      )}
    </AppShell>
  );
}

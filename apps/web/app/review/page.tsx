"use client";

import { Suspense } from "react";
import { AppShell } from "../_components/AppShell";
import { ReviewQueue } from "../_components/ReviewQueue";

/** S2 hàng chờ duyệt (plan 28). Bộ lọc nằm trên URL: `?reason=&sort=`. */
export default function ReviewQueuePage() {
  return (
    <AppShell role="reviewer">
      {() => (
        // useSearchParams cần Suspense trong Next 14.
        <Suspense fallback={<p>Đang tải…</p>}>
          <ReviewQueue />
        </Suspense>
      )}
    </AppShell>
  );
}

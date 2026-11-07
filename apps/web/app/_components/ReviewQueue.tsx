"use client";

import {
  type ReviewQueueItem,
  ReviewQueuePage,
  ReviewQueueSort,
  RuleCode,
} from "@credflow/contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../_lib/api";
import {
  parseQueueFilter,
  type QueueFilter,
  queueParams,
} from "../_lib/review";

const PAGE_SIZE = 20;
const cell = { border: "1px solid #ccc", padding: "4px 8px" } as const;

const SORT_LABEL: Record<ReviewQueueSort, string> = {
  due: "Hạn gần nhất trước",
  submitted: "Nộp sớm nhất trước",
};

/** Ghép query string của bộ lọc với tham số khác (limit, cursor). */
function withFilter(filter: QueueFilter, extra: Record<string, string>) {
  const params = new URLSearchParams(queueParams(filter));
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
}

/** S2 (plan 28): ca `needs_review`, lọc theo lý do, sắp theo hạn hoặc ngày nộp, tải thêm theo keyset. */
export function ReviewQueue() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filter = parseQueueFilter(searchParams);
  const filterKey = queueParams(filter);
  const done = searchParams.get("done") === "1";

  const [items, setItems] = useState<ReviewQueueItem[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (after: string | null) => {
      const current = parseQueueFilter(new URLSearchParams(filterKey));
      const extra: Record<string, string> = { limit: String(PAGE_SIZE) };
      if (after !== null) extra.cursor = after;
      const res = await apiFetch(
        `/review/queue?${withFilter(current, extra)}`,
        ReviewQueuePage,
      );
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setError(null);
      setItems((prev) =>
        after === null ? res.data.items : [...(prev ?? []), ...res.data.items],
      );
      setCursor(res.data.nextCursor);
    },
    [filterKey],
  );

  useEffect(() => {
    setItems(null);
    void load(null);
  }, [load]);

  function changeFilter(next: QueueFilter) {
    const qs = queueParams(next);
    router.push(qs === "" ? "/review" : `/review?${qs}`);
  }

  async function loadMore() {
    if (cursor === null) return;
    setLoadingMore(true);
    await load(cursor);
    setLoadingMore(false);
  }

  const caseHref = (id: string) =>
    filterKey === "" ? `/review/${id}` : `/review/${id}?${filterKey}`;

  return (
    <div>
      <h2>Hàng chờ duyệt</h2>
      {done && (
        <p data-testid="queue-done" role="status">
          Đã xử lý xong ca cuối cùng của bộ lọc này.
        </p>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        <label>
          Lý do{" "}
          <select
            data-testid="filter-reason"
            value={filter.reason ?? ""}
            onChange={(e) => {
              const reason = RuleCode.safeParse(e.target.value);
              changeFilter({
                sort: filter.sort,
                ...(reason.success ? { reason: reason.data } : {}),
              });
            }}
          >
            <option value="">Tất cả</option>
            {RuleCode.options.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sắp xếp{" "}
          <select
            data-testid="filter-sort"
            value={filter.sort}
            onChange={(e) => {
              const sort = ReviewQueueSort.safeParse(e.target.value);
              changeFilter({
                ...filter,
                sort: sort.success ? sort.data : "due",
              });
            }}
          >
            {ReviewQueueSort.options.map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error !== null && (
        <p role="alert" style={{ color: "#b00020" }}>
          Không tải được hàng chờ: {error}
        </p>
      )}
      {items === null ? (
        <p>Đang tải…</p>
      ) : items.length === 0 ? (
        <p data-testid="queue-empty">Không còn ca nào.</p>
      ) : (
        <>
          <table
            data-testid="queue-table"
            style={{ borderCollapse: "collapse" }}
          >
            <thead>
              <tr>
                <th style={cell}>Nhân viên</th>
                <th style={cell}>Loại giấy</th>
                <th style={cell}>Lý do</th>
                <th style={cell}>Hạn</th>
                <th style={cell}>Nộp lúc (UTC)</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} data-testid={`queue-row-${item.id}`}>
                  <td style={cell}>{item.staffName}</td>
                  <td style={cell}>{item.docType ?? "chưa phân loại"}</td>
                  <td style={cell}>
                    <code>{item.reasons.join(", ")}</code>
                  </td>
                  <td style={cell}>{item.dueDate ?? "không rõ"}</td>
                  <td style={cell}>
                    {item.createdAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td style={cell}>
                    <a href={caseHref(item.id)} data-testid="queue-open">
                      Mở
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {cursor !== null && (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              data-testid="queue-more"
              style={{ marginTop: 8 }}
            >
              {loadingMore ? "Đang tải…" : "Tải thêm"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

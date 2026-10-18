"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import type { Pagination } from "@/lib/use-pagination";
import { cn } from "@/lib/utils";

/** "11–20 of 34" with previous/next buttons. Renders nothing when everything fits on one page. */
export function Pager({ pagination: p, className }: { pagination: Pagination; className?: string }) {
  if (p.pageCount <= 1) return null;
  const from = (p.page - 1) * p.pageSize + 1;
  const to = Math.min(p.page * p.pageSize, p.total);
  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-between gap-3 text-[12.5px]", className)}>
      <p className="tabular text-fg-3">
        {from}–{to} of {p.total}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => p.setPage(p.page - 1)}
          disabled={p.page === 1}
          className="icon-btn icon-btn-sm disabled:pointer-events-none disabled:opacity-40"
          aria-label="Previous page"
        >
          <CaretLeftIcon size={16} weight="bold" />
        </button>
        <span className="tabular min-w-[4.5rem] text-center font-medium text-fg-2">
          Page {p.page} of {p.pageCount}
        </span>
        <button
          type="button"
          onClick={() => p.setPage(p.page + 1)}
          disabled={p.page === p.pageCount}
          className="icon-btn icon-btn-sm disabled:pointer-events-none disabled:opacity-40"
          aria-label="Next page"
        >
          <CaretRightIcon size={16} weight="bold" />
        </button>
      </div>
    </nav>
  );
}

/** "Load more" for feeds (notifications, activity). Pass Convex `usePaginatedQuery`'s status. */
export function LoadMore({
  status,
  onLoadMore,
  className,
}: {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  onLoadMore: () => void;
  className?: string;
}) {
  if (status !== "CanLoadMore" && status !== "LoadingMore") return null;
  return (
    <div className={cn("flex justify-center", className)}>
      <button type="button" onClick={onLoadMore} disabled={status === "LoadingMore"} className="btn btn-secondary btn-sm">
        {status === "LoadingMore" ? "Loading…" : "Load more"}
      </button>
    </div>
  );
}

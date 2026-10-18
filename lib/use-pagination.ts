import { useState } from "react";

export const TABLE_PAGE_SIZE = 10;
export const CARD_PAGE_SIZE = 5;

/**
 * Splits `items` into pages. Changing `resetKey` (e.g. the active filter or search)
 * goes back to page 1; the page is also clamped when the list shrinks.
 */
export function usePagination<T>(items: T[], pageSize: number, resetKey: unknown = null) {
  const [state, setState] = useState({ page: 1, key: resetKey });
  if (!Object.is(state.key, resetKey)) setState({ page: 1, key: resetKey });

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Object.is(state.key, resetKey) ? Math.min(state.page, pageCount) : 1;
  const start = (page - 1) * pageSize;

  return {
    pageItems: items.slice(start, start + pageSize),
    page,
    pageCount,
    pageSize,
    total: items.length,
    setPage: (p: number) => setState({ page: Math.max(1, Math.min(p, pageCount)), key: resetKey }),
  };
}

export type Pagination = Omit<ReturnType<typeof usePagination>, "pageItems">;

"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowRightIcon,
  BellSimpleIcon,
  CheckCircleIcon,
  HandCoinsIcon,
  HourglassMediumIcon,
  InfoIcon,
  XCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { useRole } from "@/lib/role-context";
import { cn, formatCurrency, formatRelativeDate } from "@/lib/utils";
import { TransactionRow } from "@/components/dashboard/widgets";
import { EmptyState } from "@/components/ui/states";
import { LoadMore } from "@/components/ui/pagination";

const NOTIFICATIONS_PAGE = 10;

const TONE_ICON = { success: CheckCircleIcon, danger: XCircleIcon, warning: HourglassMediumIcon, info: InfoIcon } as const;

/**
 * What the bell shows besides the viewer's own notifications: deal follow-ups (pipeline)
 * and recent money movement (finance). Only unread notifications count towards the badge.
 */
export function useNotifications() {
  const { can } = useRole();
  const unread = useQuery(api.notifications.unreadCount);
  const deals = useQuery(api.deals.list, can("pipeline.view") ? {} : "skip");
  const transactions = useQuery(api.transactions.list, can("finance.view") ? {} : "skip");
  const followUps = (deals ?? [])
    .filter((d) => d.value - d.paid > 0 && d.phase !== "done" && d.phase !== "hold" && d.nextAction)
    .slice(0, 5);
  return {
    followUps,
    transactions: (transactions ?? []).slice(0, 5),
    count: unread ?? 0,
  };
}

type NotificationSidebarProps = {
  open: boolean;
  onClose: () => void;
};

/** Floating panel that slides over the content from the right. */
export function NotificationSidebar({ open, onClose }: NotificationSidebarProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="animate-fade absolute inset-0 bg-[rgba(8,12,21,0.18)]" onClick={onClose} />
      <aside
        aria-label="Notifications"
        className="animate-slide absolute inset-y-2 right-2 flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[26px] bg-solid shadow-pop md:inset-y-3 md:right-3"
      >
        <div className="flex h-[4.5rem] shrink-0 items-center justify-between px-6">
          <h2 className="font-display text-[18px] font-semibold text-fg">Notifications</h2>
          <button type="button" onClick={onClose} className="icon-btn icon-btn-sm" aria-label="Close notifications">
            <XIcon size={18} />
          </button>
        </div>
        <PanelBody onClose={onClose} />
      </aside>
    </div>
  );
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const { followUps, transactions, count } = useNotifications();
  const {
    results: notifications,
    status,
    loadMore,
  } = usePaginatedQuery(api.notifications.list, {}, { initialNumItems: NOTIFICATIONS_PAGE });
  const markAllRead = useMutation(api.notifications.markAllRead);

  // Opening the panel counts as reading what's in it.
  useEffect(() => {
    if (count > 0) {
      const t = setTimeout(() => void markAllRead(), 1200);
      return () => clearTimeout(t);
    }
  }, [count, markAllRead]);

  if (status === "LoadingFirstPage") return <div className="flex-1" aria-busy="true" />;
  if (notifications.length === 0 && followUps.length === 0 && transactions.length === 0) {
    return (
      <EmptyState
        icon={BellSimpleIcon}
        title="You're all caught up"
        description="Leave, expense and approval updates will show up here."
        className="flex-1"
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 pb-6">
      {notifications.length > 0 && (
        <section>
          <h3 className="eyebrow mb-3">Updates</h3>
          <ul className="space-y-1">
            {notifications.map((n) => {
              const IconCmp = TONE_ICON[n.tone];
              return (
                <li key={n.id}>
                  <Link
                    href={n.href}
                    onClick={onClose}
                    className="-mx-2 flex items-start gap-3 rounded-2xl p-2 transition-colors hover:bg-muted"
                  >
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", `badge-${n.tone}`)}>
                      <IconCmp size={18} weight="duotone" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[13px] leading-snug text-fg", n.read ? "font-medium" : "font-semibold")}>{n.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-2">{n.body}</p>
                      <p className="mt-1 text-[11px] text-fg-3">{formatRelativeDate(new Date(n.createdAt).toISOString())}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-peach" aria-label="Unread" />}
                  </Link>
                </li>
              );
            })}
          </ul>
          <LoadMore status={status} onLoadMore={() => loadMore(NOTIFICATIONS_PAGE)} className="mt-3" />
        </section>
      )}

      {followUps.length > 0 && (
        <section>
          <h3 className="eyebrow mb-3">Follow-ups</h3>
          <ul className="space-y-1">
            {followUps.map((d) => (
              <li key={d.id}>
                <Link
                  href="/dashboard/pipeline"
                  onClick={onClose}
                  className="-mx-2 flex items-start gap-3 rounded-2xl p-2 transition-colors hover:bg-muted"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full badge-warning">
                    <HandCoinsIcon size={18} weight="duotone" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-fg">{d.client}</p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg-2">{d.nextAction}</p>
                    <p className="mt-1 text-[11px] text-fg-3">{formatCurrency(d.value - d.paid, d.currency)} outstanding</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {transactions.length > 0 && (
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="eyebrow">Recent money in & out</h3>
            <Link href="/dashboard/finance" onClick={onClose} className="flex items-center gap-1 text-[11.5px] font-semibold text-brand">
              Finance <ArrowRightIcon size={12} weight="bold" />
            </Link>
          </div>
          <div className="-mx-6 divide-y divide-line">
            {transactions.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

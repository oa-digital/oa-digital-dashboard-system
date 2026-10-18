"use client";

import type { ReactNode } from "react";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ArrowsLeftRightIcon,
  TrophyIcon,
} from "@phosphor-icons/react";
import { cn, formatCurrency, formatRelativeDate } from "@/lib/utils";
import type { Currency } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { InkCard } from "@/components/ui/card";

function formatBalance(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(2)}`;
}

/** Dark feature card with both account balances. */
export function CashCard({
  balanceGHS,
  balanceUSD,
  footer,
  className,
}: {
  balanceGHS: number;
  balanceUSD: number;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <InkCard className={cn("flex flex-col", className)}>
      <div className="relative z-10 flex items-center justify-between">
        <h2 className="font-display text-[18px] font-semibold">Cash position</h2>
        <span className="rounded-full bg-ink-chip px-2.5 py-1 text-[11px] font-medium text-ink-muted">Live</span>
      </div>

      <div className="relative z-10 mt-6">
        <p className="text-[12px] text-ink-muted">Cedis account · GHS</p>
        <p className="tabular mt-1 font-display text-[40px] font-semibold leading-none tracking-tight">
          <span className="mr-1.5 text-[20px] font-medium text-ink-muted">GH₵</span>
          {formatBalance(balanceGHS)}
        </p>
      </div>

      <div className="relative z-10 mt-5 flex items-center justify-between rounded-2xl bg-ink-chip px-4 py-3.5">
        <div>
          <p className="text-[12px] text-ink-muted">Dollar account · USD</p>
          <p className="tabular mt-0.5 font-display text-[22px] font-semibold leading-tight">${formatBalance(balanceUSD)}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 font-display text-[15px] font-semibold">
          $
        </span>
      </div>

      {footer && <div className="relative z-10 mt-auto pt-5">{footer}</div>}
    </InkCard>
  );
}

/** Key/value line used inside the ink card footer. */
export function InkMetric({ label, value, tone }: { label: string; value: string; tone?: "warm" | "cool" }) {
  return (
    <div className="flex items-center justify-between border-t border-ink-line py-3 text-[13px]">
      <span className="flex items-center gap-2 text-ink-muted">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: tone === "warm" ? "var(--oa-peach)" : "var(--oa-cyan)" }}
        />
        {label}
      </span>
      <span className="tabular font-semibold">{value}</span>
    </div>
  );
}

export type Performer = { name: string; role: string; revenue: number; activeDeals: number };

/** Ranked team list, styled as a solid inner panel. */
export function TopPerformers({ people, className }: { people: Performer[]; className?: string }) {
  const ranked = [...people].sort((a, b) => b.revenue - a.revenue).slice(0, 4);
  return (
    <div className={cn("panel p-4", className)}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-fg">Top performance</p>
        <TrophyIcon size={18} weight="duotone" className="text-peach" />
      </div>
      {ranked.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-fg-3">No team members yet.</p>
      ) : (
        <ol className="space-y-3">
          {ranked.map((p, i) => (
            <li key={p.name} className="flex items-center gap-3">
              <div className="relative">
                <Avatar name={p.name} size={36} />
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#0E1525] text-[9px] font-bold text-white ring-2 ring-[var(--card-solid)] dark:bg-white dark:text-[#0E1525]">
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-fg">{p.name}</p>
                <p className="truncate text-[11px] text-fg-3">
                  {p.activeDeals} active deal{p.activeDeals !== 1 ? "s" : ""}
                </p>
              </div>
              <p className="tabular shrink-0 text-[12px] font-semibold text-fg-2">
                {p.revenue >= 1000 ? `${(p.revenue / 1000).toFixed(0)}K` : p.revenue}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export type TxLike = {
  id: string;
  type: string;
  description: string;
  amount: string | number;
  currency: string;
  category: string;
  person?: string | null;
  date: string;
};

const TYPE_LABEL: Record<string, string> = {
  income: "Income",
  payment_received: "Received",
  expense: "Expense",
  transfer: "Transfer",
};

/** One transaction line. `compact` folds the date into the subtitle for narrow cards. */
export function TransactionRow({
  tx,
  showType = false,
  compact = false,
  action,
}: {
  tx: TxLike;
  showType?: boolean;
  compact?: boolean;
  /** Trailing control, e.g. a delete button. */
  action?: ReactNode;
}) {
  const isIn = tx.type === "income" || tx.type === "payment_received";
  const isTransfer = tx.type === "transfer";
  const IconCmp = isIn ? ArrowDownLeftIcon : isTransfer ? ArrowsLeftRightIcon : ArrowUpRightIcon;
  return (
    <div className="trow flex items-center gap-3.5 px-5 py-3.5 md:px-6">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          isIn ? "badge-success" : isTransfer ? "badge-info" : "badge-danger",
        )}
      >
        <IconCmp size={17} weight="bold" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-fg">{tx.description}</p>
        <p className="mt-0.5 truncate text-[12px] text-fg-3">
          {tx.category}
          {tx.person ? ` · ${tx.person}` : ""}
          <span className={compact ? "" : "sm:hidden"}> · {formatRelativeDate(tx.date)}</span>
        </p>
      </div>
      {showType && (
        <span
          className={cn(
            "badge hidden md:inline-flex",
            isIn ? "badge-success" : isTransfer ? "badge-info" : "badge-neutral",
          )}
        >
          {TYPE_LABEL[tx.type] ?? tx.type}
        </span>
      )}
      {!compact && (
        <p className="hidden w-24 shrink-0 text-right text-[12px] text-fg-3 sm:block">{formatRelativeDate(tx.date)}</p>
      )}
      <p
        className={cn(
          "tabular shrink-0 whitespace-nowrap text-right text-[13.5px] font-semibold",
          !compact && "w-32",
          isIn ? "text-success" : isTransfer ? "text-info" : "text-fg",
        )}
      >
        {isIn ? "+" : isTransfer ? "" : "−"}
        {formatCurrency(Number(tx.amount), tx.currency as Currency)}
      </p>
      {action}
    </div>
  );
}

"use client";

import { ArrowRightIcon, PencilSimpleIcon, TrashIcon, WalletIcon } from "@phosphor-icons/react";
import { cn, formatCurrency, formatRelativeDate } from "@/lib/utils";
import type { Deal } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { PhaseBadge } from "@/components/ui/phase-badge";
import { Progress } from "@/components/ui/states";

interface PipelineCardProps {
  deal: Deal;
  onEdit?: () => void;
  onDelete?: () => void;
  onPayments?: () => void;
  className?: string;
}

export function PipelineCard({ deal, onEdit, onDelete, onPayments, className }: PipelineCardProps) {
  const outstanding = deal.value - deal.paid;
  const progress = deal.value > 0 ? (deal.paid / deal.value) * 100 : 0;

  return (
    <article className={cn("card flex flex-col p-5 transition-shadow hover:shadow-pop", className)}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <Avatar name={deal.client} size={44} square />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] font-semibold leading-tight text-fg">{deal.client}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-fg-2">{deal.title}</p>
        </div>
        <PhaseBadge phase={deal.phase} />
      </div>

      {/* Meta grid */}
      <dl className="mt-5 grid grid-cols-3 gap-3 text-[12px]">
        <div className="min-w-0">
          <dt className="text-fg-3">Owner</dt>
          <dd className="mt-0.5 truncate font-semibold text-fg">{deal.assignee || "—"}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-fg-3">Value</dt>
          <dd className="tabular mt-0.5 truncate font-semibold text-fg">{formatCurrency(deal.value, deal.currency)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-fg-3">Remaining</dt>
          <dd className={cn("tabular mt-0.5 truncate font-semibold", outstanding > 0 ? "text-warning" : "text-success")}>
            {outstanding > 0 ? formatCurrency(outstanding, deal.currency) : "Paid"}
          </dd>
        </div>
      </dl>

      {/* Collection progress */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
          <span className="text-fg-3">Collected</span>
          <span className="tabular font-semibold text-fg-2">{progress.toFixed(0)}%</span>
        </div>
        <Progress value={progress} tone={progress >= 100 ? "success" : "brand"} />
      </div>

      {/* Next action */}
      {deal.nextAction && (
        <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-muted px-3.5 py-2.5">
          <ArrowRightIcon size={14} weight="bold" className="shrink-0 text-brand" />
          <p className="flex-1 truncate text-[12.5px] text-fg-2">{deal.nextAction}</p>
        </div>
      )}

      <div className="flex-1" />

      {(onEdit || onDelete || onPayments) && (
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
          <span className="text-[11.5px] text-fg-3">
            {deal.updatedAt ? `Updated ${formatRelativeDate(deal.updatedAt).toLowerCase()}` : ""}
          </span>
          <div className="flex gap-1">
            {onPayments && (
              <button type="button" onClick={onPayments} className="icon-btn icon-btn-sm" aria-label={`Payments for ${deal.client}`} title="Record payment">
                <WalletIcon size={17} />
              </button>
            )}
            {onEdit && (
              <button type="button" onClick={onEdit} className="icon-btn icon-btn-sm" aria-label={`Edit ${deal.client}`} title="Edit">
                <PencilSimpleIcon size={17} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="icon-btn icon-btn-sm icon-btn-danger"
                aria-label={`Remove ${deal.client}`}
                title="Remove"
              >
                <TrashIcon size={17} />
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

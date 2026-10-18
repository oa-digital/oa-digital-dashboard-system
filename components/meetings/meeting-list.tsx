"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction } from "convex/react";
import { CalendarBlankIcon, CheckIcon, CopyIcon, PencilSimpleIcon, VideoCameraIcon, XCircleIcon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { MeetingView } from "@/convex/meetings";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/modal";
import { Pager } from "@/components/ui/pagination";
import { TABLE_PAGE_SIZE, usePagination } from "@/lib/use-pagination";
import { cn, errorMessage } from "@/lib/utils";
import { MeetingDialog } from "./meeting-dialog";
import { useNow } from "@/lib/use-now";

export function meetingTime(m: { startAt: number; endAt: number }) {
  const s = new Date(m.startAt);
  const e = new Date(m.endAt);
  const t = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${s.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${t(s)}–${t(e)}`;
}

/** Meeting rows with join, copy link, edit and cancel. Paginated, 10 a page. */
export function MeetingList({
  meetings,
  compact = false,
  emptyText = "No meetings.",
  resetKey = null,
}: {
  meetings: MeetingView[];
  /** Tighter rows for cards and modals. */
  compact?: boolean;
  emptyText?: string;
  resetKey?: string | null;
}) {
  const pages = usePagination(meetings, TABLE_PAGE_SIZE, resetKey);
  const cancel = useAction(api.meetings.cancel);
  const [editing, setEditing] = useState<MeetingView | null>(null);
  const [cancelling, setCancelling] = useState<MeetingView | null>(null);
  const [cancelError, setCancelError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const now = useNow();

  if (meetings.length === 0) return <p className={cn("text-center text-[12.5px] text-fg-3", compact ? "rounded-2xl bg-muted px-4 py-5" : "px-6 py-10")}>{emptyText}</p>;

  return (
    <>
      <ul className={cn("divide-y divide-line", compact && "rounded-2xl bg-muted")}>
        {pages.pageItems.map((m) => {
          const live = m.status === "scheduled" && m.startAt - 10 * 60_000 <= now && now <= m.endAt;
          const upcoming = m.status === "scheduled" && m.endAt >= now;
          const start = new Date(m.startAt);
          return (
            <li key={m.id} className={cn("flex items-start gap-3.5", compact ? "px-4 py-3" : "px-5 py-4 md:px-6")}>
              <div
                className={cn(
                  "flex w-12 shrink-0 flex-col items-center rounded-2xl py-1.5 leading-none",
                  upcoming ? "bg-brand-soft text-brand" : "bg-muted text-fg-3",
                  compact && "bg-solid",
                )}
              >
                <span className="text-[10.5px] font-semibold uppercase">{start.toLocaleDateString("en-GB", { month: "short" })}</span>
                <span className="font-display text-[19px] font-semibold">{start.getDate()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("truncate text-[13.5px] font-semibold", m.status === "cancelled" ? "text-fg-3 line-through" : "text-fg")}>{m.title}</p>
                  {live && <Badge tone="success" dot>Now</Badge>}
                  {m.status === "cancelled" && <Badge tone="danger">Cancelled</Badge>}
                </div>
                <p className="mt-0.5 text-[12px] text-fg-2">{meetingTime(m)}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-3">
                  <span className="flex items-center gap-1.5">
                    <AvatarStack names={m.attendees.map((a) => a.name ?? a.email)} size={20} max={4} />
                    {m.attendees.length} invited
                  </span>
                  {m.project && (
                    <Link href={`/dashboard/projects/${m.project.id}`} className="hover:text-brand">
                      {m.project.key} · {m.project.name}
                    </Link>
                  )}
                  {m.contact && <span>with {m.contact.name}</span>}
                  {!compact && <span>by {m.createdBy}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {upcoming && m.meetLink && (
                  <>
                    <a href={m.meetLink} target="_blank" rel="noreferrer" className={cn("btn btn-sm", live ? "btn-primary" : "btn-secondary")}>
                      <VideoCameraIcon size={15} weight="bold" />
                      <span className="max-sm:hidden">Join</span>
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(m.meetLink!);
                        setCopied(m.id);
                        setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1500);
                      }}
                      className="icon-btn icon-btn-sm"
                      aria-label="Copy Meet link"
                      title="Copy Meet link to share"
                    >
                      {copied === m.id ? <CheckIcon size={16} className="text-success" /> : <CopyIcon size={16} />}
                    </button>
                  </>
                )}
                {m.calendarLink && !compact && (
                  <a href={m.calendarLink} target="_blank" rel="noreferrer" className="icon-btn icon-btn-sm max-md:hidden" aria-label="Open in Google Calendar" title="Open in Google Calendar">
                    <CalendarBlankIcon size={16} />
                  </a>
                )}
                {upcoming && m.canEdit && (
                  <>
                    <button type="button" onClick={() => setEditing(m)} className="icon-btn icon-btn-sm" aria-label={`Edit ${m.title}`} title="Edit or reschedule">
                      <PencilSimpleIcon size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCancelError("");
                        setCancelling(m);
                      }}
                      className="icon-btn icon-btn-sm icon-btn-danger"
                      aria-label={`Cancel ${m.title}`}
                      title="Cancel meeting"
                    >
                      <XCircleIcon size={16} />
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <Pager pagination={pages} className={compact ? "mt-2.5" : "border-t border-line px-5 py-3 md:px-6"} />

      <MeetingDialog open={Boolean(editing)} onClose={() => setEditing(null)} editing={editing} />
      <ConfirmDialog
        open={Boolean(cancelling)}
        title="Cancel this meeting?"
        message={cancelError || (cancelling ? `"${cancelling.title}" (${meetingTime(cancelling)}) will be removed from Google Calendar and everyone invited gets a cancellation.` : "")}
        confirmLabel="Cancel meeting"
        onClose={() => setCancelling(null)}
        onConfirm={async () => {
          if (!cancelling) return;
          try {
            await cancel({ id: cancelling.id });
            setCancelling(null);
          } catch (err) {
            setCancelError(errorMessage(err));
          }
        }}
      />
    </>
  );
}

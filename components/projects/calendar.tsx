"use client";

import { useState } from "react";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Pager } from "@/components/ui/pagination";
import { TABLE_PAGE_SIZE, usePagination } from "@/lib/use-pagination";
import { STATUS_FILL } from "./meta";
import type { BoardTask } from "./board";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Month grid with tasks placed on their due date (or start date if no due date). */
export function ProjectCalendar({ tasks, onOpen }: { tasks: BoardTask[]; onOpen: (id: string) => void }) {
  const now = new Date();
  const [month, setMonth] = useState(() => new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)));
  const today = ymd(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));

  // Grid starts on the Monday on/before the 1st and covers 6 weeks.
  const first = new Date(month);
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - offset);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d;
  });

  const byDay = new Map<string, BoardTask[]>();
  for (const t of tasks) {
    const day = t.dueDate ?? t.startDate;
    if (!day) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }
  const unscheduled = tasks.filter((t) => !t.dueDate && !t.startDate && t.status !== "done");
  const monthKey = month.toISOString().slice(0, 7);
  const monthTasks = [...byDay.entries()]
    .filter(([day]) => day.startsWith(monthKey))
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([day, ts]) => ts.map((task) => ({ day, task })));

  const monthPages = usePagination(monthTasks, TABLE_PAGE_SIZE, monthKey);
  const unscheduledPages = usePagination(unscheduled, TABLE_PAGE_SIZE);

  const shift = (n: number) => setMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + n, 1)));
  const label = month.toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_16rem]">
      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <h3 className="font-display text-[17px] font-semibold text-fg">{label}</h3>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMonth(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)))} className="btn btn-ghost btn-sm">
              Today
            </button>
            <button type="button" onClick={() => shift(-1)} className="icon-btn icon-btn-sm" aria-label="Previous month">
              <CaretLeftIcon size={16} />
            </button>
            <button type="button" onClick={() => shift(1)} className="icon-btn icon-btn-sm" aria-label="Next month">
              <CaretRightIcon size={16} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-t border-line text-[11px] font-semibold text-fg-3">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2.5 py-2">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-t border-line">
          {days.map((d, i) => {
            const key = ymd(d);
            const inMonth = d.getUTCMonth() === month.getUTCMonth();
            const items = byDay.get(key) ?? [];
            return (
              <div
                key={key}
                className={cn(
                  "min-h-[3.75rem] border-line p-1 md:min-h-[6.5rem] md:p-1.5",
                  i % 7 !== 6 && "border-r",
                  i < 35 && "border-b",
                  !inMonth && "bg-muted/60",
                )}
              >
                <span
                  className={cn(
                    "mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11.5px] font-semibold",
                    key === today ? "bg-brand-strong text-white" : inMonth ? "text-fg-2" : "text-fg-3",
                  )}
                >
                  {d.getUTCDate()}
                </span>
                {/* Phones: a dot per task; the agenda below lists them. */}
                <div className="flex flex-wrap gap-1 px-1 md:hidden">
                  {items.slice(0, 4).map((t) => (
                    <span key={t.id} className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_FILL[t.status] }} />
                  ))}
                </div>
                <div className="hidden space-y-1 md:block">
                  {items.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpen(t.id)}
                      title={`${t.key} ${t.title}`}
                      className={cn("block w-full truncate rounded-lg px-1.5 py-1 text-left text-[11px] font-semibold text-white", t.status === "done" && "opacity-60 line-through")}
                      style={{ background: STATUS_FILL[t.status] }}
                    >
                      {t.title}
                    </button>
                  ))}
                  {items.length > 3 && <p className="px-1.5 text-[10.5px] font-semibold text-fg-3">+{items.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Phones: this month's tasks as a readable list */}
        <ul className="divide-y divide-line border-t border-line md:hidden">
          {monthTasks.length === 0 && <li className="px-5 py-6 text-center text-[12.5px] text-fg-3">No tasks this month.</li>}
          {monthPages.pageItems.map(({ day, task: t }) => (
            <li key={t.id}>
              <button type="button" onClick={() => onOpen(t.id)} className="trow flex w-full items-center gap-3 px-5 py-3 text-left">
                <span className={cn("w-12 shrink-0 text-center", day === today ? "text-brand" : "text-fg-2")}>
                  <span className="block font-display text-[18px] font-semibold leading-none">{Number(day.slice(8))}</span>
                  <span className="block text-[10.5px] uppercase">{WEEKDAYS[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7]}</span>
                </span>
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: STATUS_FILL[t.status] }} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-[13px] font-semibold text-fg", t.status === "done" && "text-fg-3 line-through")}>{t.title}</span>
                  <span className="block truncate text-[11.5px] text-fg-3">
                    {t.key}
                    {t.assignee ? ` · ${t.assignee}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Pager pagination={monthPages} className="border-t border-line px-5 py-3 md:hidden" />
      </div>

      <aside className="card h-fit">
        <h3 className="font-display text-[15px] font-semibold text-fg">No date yet</h3>
        <p className="mb-3 mt-1 text-[12px] text-fg-3">Open tasks without a start or due date.</p>
        {unscheduled.length === 0 ? (
          <p className="text-[12.5px] text-fg-3">Everything is scheduled.</p>
        ) : (
          <ul className="space-y-1.5">
            {unscheduledPages.pageItems.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onOpen(t.id)} className="w-full rounded-xl bg-muted px-3 py-2 text-left hover:bg-[var(--row-hover)]">
                  <span className="text-[10.5px] font-semibold text-fg-3">{t.key}</span>
                  <p className="truncate text-[12.5px] font-semibold text-fg">{t.title}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Pager pagination={unscheduledPages} className="mt-3" />
      </aside>
    </div>
  );
}

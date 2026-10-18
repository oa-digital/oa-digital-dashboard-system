"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { CrownSimpleIcon, FolderSimpleIcon, ListChecksIcon, UserIcon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Progress, Skeleton } from "@/components/ui/states";
import { Pager } from "@/components/ui/pagination";
import { PRIORITY, TASK_STATUS_LABEL, formatShortDate } from "@/components/projects/meta";
import { CARD_PAGE_SIZE, TABLE_PAGE_SIZE, usePagination } from "@/lib/use-pagination";
import { cn } from "@/lib/utils";

export type ProfileTarget = { id: string; name: string; jobTitle: string };

/** A person's active projects and open tasks. */
export function ProfileDialog({ target, onClose }: { target: ProfileTarget | null; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={target?.name ?? ""}
      description={target?.jobTitle}
      icon={UserIcon}
      width="40rem"
    >
      {target && <ProfileBody key={target.id} id={target.id} />}
    </Modal>
  );
}

function ProfileBody({ id }: { id: string }) {
  const profile = useQuery(api.people.profile, { id: id as Id<"employees"> });
  const projects = usePagination(profile?.projects ?? [], CARD_PAGE_SIZE);
  const tasks = usePagination(profile?.tasks ?? [], TABLE_PAGE_SIZE);

  if (profile === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }
  if (profile === null) return <p className="text-[13px] text-fg-3">You can&apos;t see this person&apos;s work.</p>;

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-semibold text-fg">
          <FolderSimpleIcon size={17} className="text-brand" />
          Active projects
          <span className="text-[12px] font-normal text-fg-3">{profile.projects.length}</span>
        </h3>
        {profile.projects.length === 0 ? (
          <p className="rounded-2xl bg-muted px-4 py-5 text-center text-[12.5px] text-fg-3">Not on any active project.</p>
        ) : (
          <>
            <ul className="divide-y divide-line rounded-2xl bg-muted">
              {projects.pageItems.map((p) => (
                <li key={p.id}>
                  <Link href={`/dashboard/projects/${p.id}`} className="trow flex items-center gap-3 rounded-2xl px-4 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[30%] bg-brand-soft font-display text-[11px] font-bold text-brand">
                      {p.key}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold text-fg">{p.name}</span>
                        {p.isLead && <CrownSimpleIcon size={13} weight="fill" className="shrink-0 text-peach" aria-label="Team lead" />}
                      </span>
                      <span className="block truncate text-[11.5px] text-fg-3">
                        {p.client || "Internal"} · {p.isLead ? "Team lead" : "Member"}
                      </span>
                    </span>
                    <span className="hidden w-24 sm:block">
                      <Progress value={p.progress} className="h-1.5" />
                      <span className="tabular mt-1 block text-[11px] text-fg-3">{p.progress}% done</span>
                    </span>
                    <span className={cn("w-14 shrink-0 text-right text-[12px]", p.overdue ? "font-semibold text-danger" : "text-fg-3")}>
                      {p.dueDate ? formatShortDate(p.dueDate) : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pager pagination={projects} className="mt-2.5" />
          </>
        )}
      </section>

      <section>
        <h3 className="mb-2.5 flex items-center gap-2 font-display text-[15px] font-semibold text-fg">
          <ListChecksIcon size={17} className="text-brand" />
          Open tasks
          <span className="text-[12px] font-normal text-fg-3">{profile.tasks.length}</span>
        </h3>
        {profile.tasks.length === 0 ? (
          <p className="rounded-2xl bg-muted px-4 py-5 text-center text-[12.5px] text-fg-3">No open tasks.</p>
        ) : (
          <>
            <ul className="divide-y divide-line rounded-2xl bg-muted">
              {tasks.pageItems.map((t) => (
                <li key={t.id}>
                  <Link href={`/dashboard/projects/${t.projectId}?tab=board&task=${t.id}`} className="trow flex items-center gap-3 rounded-2xl px-4 py-3">
                    <span className="w-16 shrink-0 text-[11px] font-semibold text-fg-3">{t.key}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-fg">{t.title}</span>
                      <span className="block truncate text-[11.5px] text-fg-3">
                        {t.project} · {TASK_STATUS_LABEL[t.status]}
                      </span>
                    </span>
                    <Badge tone={PRIORITY[t.priority].tone} className="hidden sm:inline-flex">
                      {PRIORITY[t.priority].label}
                    </Badge>
                    <span className={cn("w-14 shrink-0 text-right text-[12px]", t.overdue ? "font-semibold text-danger" : "text-fg-3")}>
                      {t.dueDate ? formatShortDate(t.dueDate) : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pager pagination={tasks} className="mt-2.5" />
          </>
        )}
      </section>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  CalendarPlusIcon,
  CrownSimpleIcon,
  FileIcon,
  FilePdfIcon,
  FileImageIcon,
  GoogleDriveLogoIcon,
  PresentationChartIcon,
  TableIcon,
  FileDocIcon,
  HandshakeIcon,
  LinkSimpleIcon,
  TrashIcon,
  UploadSimpleIcon,
  UserMinusIcon,
  UserPlusIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, Input, Select } from "@/components/ui/field";
import { EmptyState, Progress } from "@/components/ui/states";
import { LoadMore, Pager } from "@/components/ui/pagination";
import { MeetingDialog } from "@/components/meetings/meeting-dialog";
import { useNow } from "@/lib/use-now";
import { MeetingList } from "@/components/meetings/meeting-list";
import { GoogleNotice, useGoogleConnected } from "@/components/meetings/google-notice";
import { TABLE_PAGE_SIZE, usePagination } from "@/lib/use-pagination";
import { cn, errorMessage, formatCurrency, formatRelativeDate } from "@/lib/utils";
import type { Currency } from "@/lib/types";
import { PRIORITY, TASK_COLUMNS, formatShortDate } from "./meta";

export type ProjectDetail = Extract<NonNullable<FunctionReturnType<typeof api.projects.get>>, { forbidden: false }>;

// ── Overview ───────────────────────────────────────────────────────────

export function OverviewTab({ project, onOpenTask }: { project: ProjectDetail; onOpenTask: (id: string) => void }) {
  const { stats } = project;
  const progress = stats.total ? Math.round((stats.byStatus.done / stats.total) * 100) : 0;
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
      <div className="space-y-5 xl:col-span-8">
        <Card>
          <CardHeader title="About this project" />
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg-2">{project.description || "No description yet."}</p>
        </Card>

        <Card>
          <CardHeader title="Progress" description={`${stats.byStatus.done} of ${stats.total} tasks done`} />
          <div className="flex items-end gap-4">
            <p className="tabular font-display text-[44px] font-semibold leading-none text-fg">
              {progress}
              <span className="text-[22px] text-fg-3">%</span>
            </p>
            <Progress value={progress} tone={progress === 100 ? "success" : "brand"} className="mb-2 h-2.5" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {TASK_COLUMNS.map((c) => (
              <div key={c.status} className="rounded-2xl bg-muted p-3.5">
                <p className="flex items-center gap-1.5 text-[12px] text-fg-3">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />
                  {c.label}
                </p>
                <p className="tabular mt-1 font-display text-[22px] font-semibold text-fg">{stats.byStatus[c.status]}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(["urgent", "high", "medium", "low"] as const).map((p) => (
              <Badge key={p} tone={PRIORITY[p].tone}>
                {stats.byPriority[p]} {PRIORITY[p].label.toLowerCase()}
              </Badge>
            ))}
            {stats.overdue > 0 && <Badge tone="danger" dot>{stats.overdue} overdue</Badge>}
            {stats.unassigned > 0 && <Badge tone="neutral">{stats.unassigned} unassigned</Badge>}
          </div>
        </Card>

        <Card flush>
          <div className="p-5 pb-3 md:p-6 md:pb-3">
            <CardHeader title="Coming up" description="Open tasks by due date" className="mb-0" />
          </div>
          {project.upcoming.length === 0 ? (
            <p className="px-6 pb-6 text-[13px] text-fg-3">No open tasks have a due date.</p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {project.upcoming.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => onOpenTask(t.id)} className="trow flex w-full items-center gap-3 px-5 py-3 text-left md:px-6">
                    <span className="w-16 shrink-0 text-[11px] font-semibold text-fg-3">{t.key}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{t.title}</span>
                    <Badge tone={PRIORITY[t.priority].tone} className="hidden sm:inline-flex">{PRIORITY[t.priority].label}</Badge>
                    {t.assignee ? <Avatar name={t.assignee} size={26} /> : <span className="w-[26px]" />}
                    <span className={cn("w-16 text-right text-[12px]", t.overdue ? "font-semibold text-danger" : "text-fg-2")}>{formatShortDate(t.dueDate)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-5 xl:col-span-4">
        <Card>
          <CardHeader title="Key dates" />
          <dl className="space-y-3 text-[13px]">
            <div className="flex justify-between">
              <dt className="text-fg-3">Start</dt>
              <dd className="font-semibold text-fg">{project.startDate ? formatShortDate(project.startDate) : "Not set"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-3">Due</dt>
              <dd className={cn("font-semibold", project.overdue ? "text-danger" : "text-fg")}>{project.dueDate ? formatShortDate(project.dueDate) : "Not set"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-3">Team</dt>
              <dd className="font-semibold text-fg">{project.members.length} people</dd>
            </div>
          </dl>
        </Card>

        {project.deal && (
          <Card>
            <CardHeader title="Linked deal" />
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                <HandshakeIcon size={19} weight="duotone" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold text-fg">{project.deal.client}</p>
                <p className="truncate text-[12px] text-fg-3">{project.deal.title}</p>
                {project.deal.value !== null && (
                  <p className="mt-1 text-[12px] text-fg-2">
                    {formatCurrency(project.deal.paid ?? 0, project.deal.currency as Currency)} of {formatCurrency(project.deal.value, project.deal.currency as Currency)} collected
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        <ProjectMeetings project={project} />
        <ActivityFeed projectId={project.id as Id<"projects">} />
      </div>
    </div>
  );
}

/** Upcoming meetings for this project, with a button to schedule one with the team. */
function ProjectMeetings({ project }: { project: ProjectDetail }) {
  const meetings = useQuery(api.meetings.list, { projectId: project.id as Id<"projects"> });
  const connected = useGoogleConnected();
  const [open, setOpen] = useState(false);
  const now = useNow();
  const upcoming = (meetings ?? []).filter((m) => m.status === "scheduled" && m.endAt >= now);
  return (
    <Card>
      <CardHeader
        title="Meetings"
        description={upcoming.length ? `${upcoming.length} coming up` : "Nothing scheduled"}
        action={
          connected && (
            <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary btn-sm">
              <CalendarPlusIcon size={14} weight="bold" />
              Schedule
            </button>
          )
        }
      />
      <GoogleNotice what="Scheduling meetings" className="mb-3" />
      {meetings === undefined ? null : <MeetingList meetings={upcoming} compact emptyText="No upcoming meetings for this project." />}
      <MeetingDialog
        open={open}
        onClose={() => setOpen(false)}
        preset={{ title: `${project.name}: `, projectId: project.id, employeeIds: project.members.map((m) => m.id as string) }}
      />
    </Card>
  );
}

const ACTIVITY_PAGE = 10;

/** Fixed-height, scrollable feed; older entries load on demand. */
function ActivityFeed({ projectId }: { projectId: Id<"projects"> }) {
  const { results, status, loadMore } = usePaginatedQuery(api.projects.activity, { projectId }, { initialNumItems: ACTIVITY_PAGE });
  return (
    <Card className="flex h-[28rem] flex-col">
      <CardHeader title="Activity" />
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {status === "LoadingFirstPage" ? (
          <p className="text-[13px] text-fg-3">Loading…</p>
        ) : results.length === 0 ? (
          <p className="text-[13px] text-fg-3">Nothing yet.</p>
        ) : (
          <>
            <ul className="space-y-3">
              {results.map((a) => (
                <li key={a.id} className="flex gap-2.5 text-[12.5px]">
                  <Avatar name={a.actor} size={26} />
                  <div className="min-w-0">
                    <p className="text-fg-2">
                      <span className="font-semibold text-fg">{a.actor}</span> {a.text}
                    </p>
                    <p className="text-[11px] text-fg-3">{formatRelativeDate(new Date(a.createdAt).toISOString())}</p>
                  </div>
                </li>
              ))}
            </ul>
            <LoadMore status={status} onLoadMore={() => loadMore(ACTIVITY_PAGE)} className="mt-4 pb-1" />
          </>
        )}
      </div>
    </Card>
  );
}

// ── Team ───────────────────────────────────────────────────────────────

export function TeamTab({ project }: { project: ProjectDetail }) {
  const addMember = useMutation(api.projects.addMember);
  const removeMember = useMutation(api.projects.removeMember);
  const setLead = useMutation(api.projects.setLead);
  const [adding, setAdding] = useState("");
  const [error, setError] = useState("");
  const pid = project.id as Id<"projects">;
  const members = usePagination(project.members, 6);

  async function attempt(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}
      {project.canManage && project.addable.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3">
          <Select value={adding} onChange={(e) => setAdding(e.target.value)} className="max-w-sm flex-1" aria-label="Person to add">
            <option value="">Add someone to the team…</option>
            {project.addable.map((p) => (
              <option key={p.id} value={p.id}>{p.name} · {p.jobTitle}</option>
            ))}
          </Select>
          <button
            type="button"
            disabled={!adding}
            onClick={() => attempt(async () => { await addMember({ projectId: pid, employeeId: adding as Id<"employees"> }); setAdding(""); })}
            className="btn btn-primary"
          >
            <UserPlusIcon size={16} weight="bold" />
            Add to team
          </button>
        </Card>
      )}

      {project.members.length === 0 ? (
        <div className="card">
          <EmptyState icon={UserPlusIcon} title="No one on the team yet" description="Add people so you can assign them tasks." />
        </div>
      ) : (
        <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {members.pageItems.map((m) => (
            <article key={m.id} className={cn("card flex flex-col p-5", m.isLead && "shadow-[0_0_0_2px_var(--brand-ring),var(--card-shadow)]")}>
              <div className="flex items-start gap-3.5">
                <Avatar name={m.name} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-[16px] font-semibold text-fg">{m.name}</p>
                  <p className="truncate text-[12.5px] text-fg-2">{m.jobTitle}</p>
                  {m.department && <p className="truncate text-[11.5px] text-fg-3">{m.department}</p>}
                </div>
                {m.isLead && (
                  <Badge tone="info">
                    <CrownSimpleIcon size={12} weight="fill" />
                    Team lead
                  </Badge>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-muted p-3.5 text-[12px]">
                <div>
                  <dt className="text-fg-3">Open tasks</dt>
                  <dd className="tabular font-display text-[18px] font-semibold text-fg">{m.openTasks}</dd>
                </div>
                <div>
                  <dt className="text-fg-3">Done</dt>
                  <dd className="tabular font-display text-[18px] font-semibold text-fg">{m.doneTasks}</dd>
                </div>
              </dl>
              <div className="flex-1" />
              {project.canManage && !m.isLead && (
                <div className="mt-4 flex justify-end gap-1 border-t border-line pt-3">
                  <button type="button" onClick={() => attempt(() => setLead({ projectId: pid, employeeId: m.id as Id<"employees"> }))} className="btn btn-ghost btn-sm">
                    <CrownSimpleIcon size={14} />
                    Make lead
                  </button>
                  <button
                    type="button"
                    onClick={() => attempt(() => removeMember({ projectId: pid, employeeId: m.id as Id<"employees"> }))}
                    className="icon-btn icon-btn-sm icon-btn-danger"
                    aria-label={`Remove ${m.name}`}
                    title="Remove from team (their open tasks become unassigned)"
                  >
                    <UserMinusIcon size={16} />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
        <Pager pagination={members} />
        </div>
      )}
    </div>
  );
}

// ── Documents ──────────────────────────────────────────────────────────

const MAX_BYTES = 25 * 1024 * 1024;

const GOOGLE_FILE = {
  document: { label: "Google Doc", icon: FileDocIcon },
  spreadsheet: { label: "Google Sheet", icon: TableIcon },
  presentation: { label: "Google Slides", icon: PresentationChartIcon },
} as const;
type GoogleType = keyof typeof GOOGLE_FILE;

function fileIcon(contentType: string | null) {
  if (contentType?.includes("pdf")) return FilePdfIcon;
  if (contentType?.startsWith("image/")) return FileImageIcon;
  return FileIcon;
}

function formatBytes(n: number) {
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function DocumentsTab({ projectId }: { projectId: Id<"projects"> }) {
  const docs = useQuery(api.projects.documents, { projectId });
  const docPages = usePagination(docs ?? [], TABLE_PAGE_SIZE);
  const generateUploadUrl = useMutation(api.projects.generateUploadUrl);
  const addDocument = useMutation(api.projects.addDocument);
  const removeDocument = useMutation(api.projects.removeDocument);
  const retryDriveCopy = useMutation(api.drive.retryDriveCopy);
  const fileInput = useRef<HTMLInputElement>(null);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const createGoogleFile = useAction(api.drive.createGoogleFile);
  const connected = useGoogleConnected();
  const [gName, setGName] = useState("");
  const [gType, setGType] = useState<GoogleType>("document");
  const [creating, setCreating] = useState(false);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const list = Array.from(files);
    const tooBig = list.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setError(`"${tooBig.name}" is over 25 MB.`);
    setUploading(list.length);
    try {
      for (const file of list) {
        const url = await generateUploadUrl({ projectId });
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
        if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
        await addDocument({ projectId, name: file.name, storageId, size: file.size, contentType: file.type || undefined });
        setUploading((n) => n - 1);
      }
    } catch (err) {
      setError(err instanceof Error && !("data" in err) ? err.message : errorMessage(err));
    } finally {
      setUploading(0);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}
      {notice && <Alert tone="info" icon={WarningCircleIcon}>{notice}</Alert>}
      <Card>
        <CardHeader
          title="Create in Google Drive"
          description="A new Doc, Sheet or Slides in the company Drive, in this project's folder. Anyone with the link can edit."
          className="mb-3"
        />
        {connected === false ? (
          <GoogleNotice what="Creating Google files" />
        ) : (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setNotice("");
              setCreating(true);
              try {
                const warning = await createGoogleFile({ projectId, name: gName, type: gType });
                if (warning) setNotice(warning);
                setGName("");
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setCreating(false);
              }
            }}
          >
            <Select value={gType} onChange={(e) => setGType(e.target.value as GoogleType)} className="sm:w-44" aria-label="File type">
              {(Object.keys(GOOGLE_FILE) as GoogleType[]).map((t) => (
                <option key={t} value={t}>{GOOGLE_FILE[t].label}</option>
              ))}
            </Select>
            <Input required value={gName} onChange={(e) => setGName(e.target.value)} placeholder="Name, e.g. Site survey report" maxLength={200} />
            <button type="submit" disabled={creating || !connected} className="btn btn-primary shrink-0">
              <GoogleDriveLogoIcon size={16} weight="bold" />
              {creating ? "Creating…" : "Create"}
            </button>
          </form>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col items-start gap-3">
          <CardHeader
            title="Upload files"
            description={connected ? "Specs, contracts, designs. Up to 25 MB each. A copy is saved to the project's Drive folder." : "Specs, contracts, designs. Up to 25 MB each."}
            className="mb-0"
          />
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
          <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading > 0} className="btn btn-primary">
            <UploadSimpleIcon size={16} weight="bold" />
            {uploading ? `Uploading ${uploading}…` : "Choose files"}
          </button>
        </Card>
        <Card>
          <CardHeader title="Add a link" description="Google Docs, Figma, a repo…" className="mb-3" />
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await addDocument({ projectId, name: linkName || linkUrl, url: linkUrl.trim() });
                setLinkName("");
                setLinkUrl("");
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            <Input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Name" className="sm:w-40" />
            <Input required type="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
            <button type="submit" className="btn btn-secondary shrink-0">
              <LinkSimpleIcon size={16} />
              Add
            </button>
          </form>
        </Card>
      </div>

      <Card flush>
        {!docs || docs.length === 0 ? (
          <EmptyState icon={FileIcon} title="No documents yet" description="Upload files or add links so the whole team can find them." />
        ) : (
          <ul className="divide-y divide-line">
            {docPages.pageItems.map((d) => {
              const Icon = d.kind === "google" && d.googleType ? GOOGLE_FILE[d.googleType].icon : d.kind === "link" ? LinkSimpleIcon : fileIcon(d.contentType);
              return (
                <li key={d.id} className="trow flex items-center gap-3.5 px-5 py-3.5 md:px-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
                    <Icon size={19} weight="duotone" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noreferrer" className="block truncate text-[13.5px] font-semibold text-fg hover:text-brand">
                        {d.name}
                      </a>
                    ) : (
                      <p className="truncate text-[13.5px] font-semibold text-fg">{d.name}</p>
                    )}
                    <p className="truncate text-[12px] text-fg-3">
                      {d.kind === "google" && d.googleType ? GOOGLE_FILE[d.googleType].label : d.kind === "link" ? "Link" : d.size ? formatBytes(d.size) : "File"} · {d.uploadedBy} · {formatRelativeDate(new Date(d.createdAt).toISOString())}
                    </p>
                  </div>
                  {d.kind === "file" &&
                    (d.driveUrl ? (
                      <a
                        href={d.driveUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="icon-btn icon-btn-sm text-brand"
                        aria-label={`Open ${d.name} in Google Drive`}
                        title="Open the copy in Google Drive"
                      >
                        <GoogleDriveLogoIcon size={16} weight="bold" />
                      </a>
                    ) : d.driveStatus === "pending" ? (
                      <span className="text-[11.5px] text-fg-3">Saving to Drive…</span>
                    ) : (
                      connected && (
                        <button
                          type="button"
                          onClick={async () => {
                            setError("");
                            try {
                              await retryDriveCopy({ documentId: d.id });
                            } catch (err) {
                              setError(errorMessage(err));
                            }
                          }}
                          className={cn("btn btn-ghost btn-sm", d.driveStatus === "failed" && "text-danger")}
                          title={d.driveStatus === "failed" ? "Copying to Drive failed. Try again." : "Save a copy to the project's Drive folder"}
                        >
                          <GoogleDriveLogoIcon size={14} weight="bold" />
                          {d.driveStatus === "failed" ? "Retry Drive" : "Save to Drive"}
                        </button>
                      )
                    ))}
                  {d.canDelete && (
                    <button type="button" onClick={() => removeDocument({ id: d.id })} className="icon-btn icon-btn-sm icon-btn-danger" aria-label={`Remove ${d.name}`} title="Remove">
                      <TrashIcon size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <Pager pagination={docPages} className="border-t border-line px-5 py-3 md:px-6" />
      </Card>
    </div>
  );
}

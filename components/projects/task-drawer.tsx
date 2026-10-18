"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { ChatCircleIcon, PaperPlaneRightIcon, TrashIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { ConfirmDialog } from "@/components/ui/modal";
import { errorMessage, formatRelativeDate } from "@/lib/utils";
import { PRIORITY, TASK_COLUMNS, type TaskPriority, type TaskStatus } from "./meta";

export type TaskView = {
  id: string;
  key: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  createdBy: string;
};

/** Slide-over editor for one task. Fields save as you leave them. */
export function TaskDrawer({
  task,
  members,
  canManage,
  viewerId,
  onClose,
}: {
  task: TaskView | null;
  members: { id: string; name: string }[];
  canManage: boolean;
  viewerId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!task) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, onClose]);

  if (!task) return null;
  return createPortal(
    <div className="fixed inset-0 z-[55]">
      <div className="animate-fade absolute inset-0 bg-[rgba(8,12,21,0.25)]" onClick={onClose} />
      <aside
        aria-label={`Task ${task.key}`}
        className="animate-slide absolute inset-y-2 right-2 flex w-[30rem] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-[26px] bg-solid shadow-pop md:inset-y-3 md:right-3"
      >
        <TaskEditor key={task.id} task={task} members={members} canDelete={canManage || task.createdBy === viewerId} onClose={onClose} />
      </aside>
    </div>,
    document.body,
  );
}

function TaskEditor({
  task,
  members,
  canDelete,
  onClose,
}: {
  task: TaskView;
  members: { id: string; name: string }[];
  canDelete: boolean;
  onClose: () => void;
}) {
  const update = useMutation(api.tasks.update);
  const remove = useMutation(api.tasks.remove);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const id = task.id as Id<"tasks">;

  async function save(patch: Parameters<typeof update>[0]) {
    setError("");
    try {
      await update(patch);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <>
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line px-6">
        <span className="kbd !h-6 !text-[11px]">{task.key}</span>
        <div className="flex gap-1">
          {canDelete && (
            <button type="button" onClick={() => setDeleting(true)} className="icon-btn icon-btn-sm icon-btn-danger" aria-label="Delete task" title="Delete task">
              <TrashIcon size={17} />
            </button>
          )}
          <button type="button" onClick={onClose} className="icon-btn icon-btn-sm" aria-label="Close">
            <XIcon size={18} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}

        <textarea
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() !== task.title && save({ id, title })}
          rows={2}
          className="w-full resize-none bg-transparent font-display text-[20px] font-semibold leading-snug text-fg outline-none focus-visible:outline-none"
          aria-label="Task title"
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={task.status} onChange={(e) => save({ id, status: e.target.value as TaskStatus })}>
              {TASK_COLUMNS.map((c) => (
                <option key={c.status} value={c.status}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={task.priority} onChange={(e) => save({ id, priority: e.target.value as TaskPriority })}>
              {(Object.keys(PRIORITY) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>{PRIORITY[p].label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Assignee">
            <Select
              value={task.assigneeId ?? ""}
              onChange={(e) => save({ id, assigneeId: (e.target.value || null) as Id<"employees"> | null })}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </Select>
          </Field>
          <div />
          <Field label="Start">
            <Input type="date" value={task.startDate ?? ""} onChange={(e) => save({ id, startDate: e.target.value || null })} />
          </Field>
          <Field label="Due">
            <Input type="date" min={task.startDate ?? undefined} value={task.dueDate ?? ""} onChange={(e) => save({ id, dueDate: e.target.value || null })} />
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== task.description && save({ id, description })}
            placeholder="Add details, acceptance criteria or links."
            className="min-h-28"
          />
        </Field>

        <Comments taskId={id} />
      </div>

      <ConfirmDialog
        open={deleting}
        title={`Delete ${task.key}?`}
        message={`"${task.title}" and its comments will be removed for good.`}
        confirmLabel="Delete task"
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          await remove({ id });
          setDeleting(false);
          onClose();
        }}
      />
    </>
  );
}

const COMMENTS_PAGE = 10;

function Comments({ taskId }: { taskId: Id<"tasks"> }) {
  const comments = useQuery(api.tasks.comments, { taskId });
  const add = useMutation(api.tasks.addComment);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  // Long threads show the latest comments; older ones load on demand.
  const [shown, setShown] = useState(COMMENTS_PAGE);
  const all = comments ?? [];
  const hidden = Math.max(0, all.length - shown);

  return (
    <section>
      <p className="eyebrow mb-3 flex items-center gap-1.5">
        <ChatCircleIcon size={13} weight="bold" />
        Comments {comments?.length ? `· ${comments.length}` : ""}
      </p>
      {hidden > 0 && (
        <button type="button" onClick={() => setShown((n) => n + COMMENTS_PAGE)} className="btn btn-ghost btn-sm mb-3">
          Show {Math.min(hidden, COMMENTS_PAGE)} earlier comment{Math.min(hidden, COMMENTS_PAGE) !== 1 ? "s" : ""}
        </button>
      )}
      <ul className="space-y-3">
        {all.slice(hidden).map((c) => (
          <li key={c.id} className="flex gap-2.5">
            <Avatar name={c.author} size={28} />
            <div className="min-w-0 flex-1 rounded-2xl bg-muted px-3 py-2">
              <p className="text-[12px]">
                <span className="font-semibold text-fg">{c.author}</span>{" "}
                <span className="text-fg-3">{formatRelativeDate(new Date(c.createdAt).toISOString())}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-fg-2">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          setSending(true);
          await add({ taskId, body });
          setBody("");
          setSending(false);
        }}
      >
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" className="min-h-11! py-2.5" rows={1} />
        <button type="submit" disabled={sending || !body.trim()} className="icon-btn shrink-0 !bg-[var(--brand-strong)] !text-white disabled:opacity-50" aria-label="Send comment">
          <PaperPlaneRightIcon size={17} weight="fill" />
        </button>
      </form>
    </section>
  );
}

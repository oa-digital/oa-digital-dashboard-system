"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { VideoCameraIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MeetingView } from "@/convex/meetings";
import { Modal, ModalActions } from "@/components/ui/modal";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { errorMessage } from "@/lib/utils";

/** What a new meeting starts with, e.g. a project's team or a contact. */
export type MeetingPreset = {
  title?: string;
  projectId?: string;
  contactId?: string;
  employeeIds?: string[];
  contactIds?: string[];
};

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function localTime(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** The next half hour from now, at least 15 minutes away. */
function nextSlot() {
  const d = new Date(Date.now() + 15 * 60_000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d;
}

export function MeetingDialog({
  open,
  onClose,
  preset,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  preset?: MeetingPreset;
  /** Set to reschedule or change an existing meeting. */
  editing?: MeetingView | null;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit meeting" : "Schedule a meeting"}
      description="Creates a Google Calendar event with a Meet link and emails the invites."
      icon={VideoCameraIcon}
      width="38rem"
    >
      {open && <MeetingForm key={editing?.id ?? "new"} preset={preset} editing={editing ?? null} onClose={onClose} />}
    </Modal>
  );
}

function MeetingForm({ preset, editing, onClose }: { preset?: MeetingPreset; editing: MeetingView | null; onClose: () => void }) {
  const people = useQuery(api.meetings.invitees);
  const schedule = useAction(api.meetings.schedule);
  const reschedule = useAction(api.meetings.reschedule);

  const start = editing ? new Date(editing.startAt) : nextSlot();
  const [title, setTitle] = useState(editing?.title ?? preset?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [date, setDate] = useState(localDate(start));
  const [time, setTime] = useState(localTime(start));
  const [duration, setDuration] = useState(editing ? Math.round((editing.endAt - editing.startAt) / 60_000) : 30);
  const [employeeIds, setEmployeeIds] = useState<string[]>(
    editing ? editing.attendees.flatMap((a) => (a.employeeId ? [a.employeeId] : [])) : (preset?.employeeIds ?? []),
  );
  const [contactIds, setContactIds] = useState<string[]>(
    editing ? editing.attendees.flatMap((a) => (a.contactId ? [a.contactId] : [])) : (preset?.contactIds ?? []),
  );
  const [guests, setGuests] = useState<string[]>(
    editing ? editing.attendees.filter((a) => !a.employeeId && !a.contactId).map((a) => a.email) : [],
  );
  const [guestDraft, setGuestDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const employees = people?.employees ?? [];
  const contacts = people?.contacts ?? [];
  const durations = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);

  function addGuests(raw: string) {
    const emails = raw.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    const bad = emails.find((e) => !EMAIL_RE.test(e));
    if (bad) {
      setError(`"${bad}" isn't a valid email address.`);
      return false;
    }
    setError("");
    setGuests((g) => [...new Set([...g, ...emails.map((e) => e.toLowerCase())])]);
    setGuestDraft("");
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (guestDraft.trim() && !addGuests(guestDraft)) return;
    const startAt = new Date(`${date}T${time}`).getTime();
    if (Number.isNaN(startAt)) return setError("Pick a date and time.");
    setBusy(true);
    setError("");
    const pendingGuests = guestDraft.trim() ? [...guests, ...guestDraft.split(/[\s,;]+/).filter(Boolean)] : guests;
    const input = {
      title,
      description,
      startAt,
      endAt: startAt + duration * 60_000,
      employeeIds: employeeIds as Id<"employees">[],
      contactIds: contactIds as Id<"contacts">[],
      guestEmails: pendingGuests,
    };
    try {
      if (editing) await reschedule({ id: editing.id, ...input });
      else
        await schedule({
          ...input,
          projectId: preset?.projectId as Id<"projects"> | undefined,
          contactId: preset?.contactId as Id<"contacts"> | undefined,
        });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const chips = [
    ...employeeIds.map((id) => {
      const e = employees.find((x) => x.id === id);
      return { key: `e-${id}`, label: e?.name ?? "Teammate", sub: e?.email ?? "", remove: () => setEmployeeIds((xs) => xs.filter((x) => x !== id)) };
    }),
    ...contactIds.map((id) => {
      const c = contacts.find((x) => x.id === id);
      return { key: `c-${id}`, label: c?.name ?? "Contact", sub: c?.email ?? "", remove: () => setContactIds((xs) => xs.filter((x) => x !== id)) };
    }),
    ...guests.map((email) => ({ key: `g-${email}`, label: email, sub: "Guest", remove: () => setGuests((xs) => xs.filter((x) => x !== email)) })),
  ];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}

      <Field label="Title">
        <Input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Site survey kickoff" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem_9rem]">
        <Field label="Date">
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start">
          <Input required type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Length">
          <Select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {durations.map((d) => (
              <option key={d} value={d}>
                {d < 60 ? `${d} min` : `${d / 60} hr${d > 60 ? "s" : ""}`}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[12px] font-semibold text-fg-2">People</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            value=""
            onChange={(e) => e.target.value && setEmployeeIds((xs) => [...xs, e.target.value])}
            aria-label="Add a teammate"
            disabled={!people}
          >
            <option value="">Add a teammate…</option>
            {employees
              .filter((x) => !employeeIds.includes(x.id) && x.id !== people?.viewerId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.jobTitle}
                </option>
              ))}
          </Select>
          {contacts.length > 0 && (
            <Select value="" onChange={(e) => e.target.value && setContactIds((xs) => [...xs, e.target.value])} aria-label="Add a contact">
              <option value="">Add a contact…</option>
              {contacts
                .filter((x) => !contactIds.includes(x.id))
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.company ? ` · ${x.company}` : ""}
                  </option>
                ))}
            </Select>
          )}
        </div>
        <Input
          type="text"
          inputMode="email"
          value={guestDraft}
          onChange={(e) => setGuestDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && guestDraft.trim()) {
              e.preventDefault();
              addGuests(guestDraft);
            }
          }}
          onBlur={() => guestDraft.trim() && addGuests(guestDraft)}
          placeholder="Invite anyone else by email, then press Enter"
          aria-label="Guest emails"
        />
        <p className="text-[11.5px] text-fg-3">You&apos;re included automatically. Everyone gets a Google Calendar invite with the Meet link.</p>
        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <li key={c.key} className="flex items-center gap-2 rounded-full bg-muted py-1 pl-1 pr-1.5 text-[12px]">
                <Avatar name={c.label} size={22} />
                <span className="max-w-[12rem] truncate font-medium text-fg" title={c.sub}>
                  {c.label}
                </span>
                <button type="button" onClick={c.remove} className="icon-btn icon-btn-sm h-6! w-6!" aria-label={`Remove ${c.label}`}>
                  <XIcon size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Field label="Agenda (optional)">
        <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this meeting about?" />
      </Field>

      <ModalActions onClose={onClose} submitLabel={busy ? (editing ? "Saving…" : "Scheduling…") : editing ? "Save and notify" : "Schedule and invite"} />
    </form>
  );
}

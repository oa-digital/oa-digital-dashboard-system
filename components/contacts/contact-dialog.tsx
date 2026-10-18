"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  AddressBookIcon,
  BuildingsIcon,
  CalendarPlusIcon,
  CaretDownIcon,
  EnvelopeSimpleIcon,
  NoteIcon,
  PaperPlaneTiltIcon,
  PhoneIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Modal } from "@/components/ui/modal";
import { Alert, Field, Input, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/states";
import { Pager } from "@/components/ui/pagination";
import { TABLE_PAGE_SIZE, usePagination } from "@/lib/use-pagination";
import { cn, errorMessage, formatDate, formatRelativeDate } from "@/lib/utils";
import { MeetingDialog } from "@/components/meetings/meeting-dialog";
import { useNow } from "@/lib/use-now";
import { MeetingList } from "@/components/meetings/meeting-list";
import { GoogleNotice, useGoogleConnected } from "@/components/meetings/google-notice";

export type ContactTarget = { id: string; name: string; compose?: boolean };

const STATUS: Record<"sending" | "sent" | "failed", { label: string; tone: BadgeTone }> = {
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

/** A contact's details, emails sent to them from the app, and a form to send another. */
export function ContactDialog({ target, tagTone, onClose }: { target: ContactTarget | null; tagTone: (tag: string) => BadgeTone; onClose: () => void }) {
  return (
    <Modal open={Boolean(target)} onClose={onClose} title={target?.name ?? ""} icon={AddressBookIcon} width="40rem">
      {target && <ContactBody key={target.id} id={target.id} startComposing={Boolean(target.compose)} tagTone={tagTone} />}
    </Modal>
  );
}

function ContactBody({ id, startComposing, tagTone }: { id: string; startComposing: boolean; tagTone: (tag: string) => BadgeTone }) {
  const contact = useQuery(api.contacts.get, { id: id as Id<"contacts"> });
  const [composing, setComposing] = useState(startComposing);
  const [open, setOpen] = useState<string | null>(null);
  const history = usePagination(contact?.emails ?? [], TABLE_PAGE_SIZE);

  if (contact === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    );
  }
  if (contact === null) return <p className="text-[13px] text-fg-3">This contact no longer exists.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Avatar name={contact.name} size={56} />
        <div className="min-w-0 flex-1">
          {contact.company && <p className="truncate text-[13px] font-semibold text-fg-2">{contact.company}</p>}
          {contact.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <Badge key={tag} tone={tagTone(tag)} className="capitalize">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[11.5px] text-fg-3">Added {formatDate(contact.createdAt)}</p>
        </div>
      </div>

      <dl className="grid gap-3 rounded-2xl bg-muted p-4 text-[13px] sm:grid-cols-2">
        <Detail icon={EnvelopeSimpleIcon} label="Email">
          {contact.email ? (
            <a href={`mailto:${contact.email}`} className="break-all hover:text-brand">
              {contact.email}
            </a>
          ) : (
            "—"
          )}
        </Detail>
        <Detail icon={PhoneIcon} label="Phone">
          {contact.phone ? (
            <a href={`tel:${contact.phone}`} className="hover:text-brand">
              {contact.phone}
            </a>
          ) : (
            "—"
          )}
        </Detail>
        <Detail icon={BuildingsIcon} label="Company">
          {contact.company || "—"}
        </Detail>
        <Detail icon={NoteIcon} label="Notes" className="sm:col-span-2">
          <span className="whitespace-pre-wrap">{contact.notes || "—"}</span>
        </Detail>
      </dl>

      {contact.email && <ContactMeetings contactId={contact.id} name={contact.name} />}

      <section>
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h3 className="font-display text-[15px] font-semibold text-fg">Emails</h3>
          {contact.email && !composing && (
            <button type="button" onClick={() => setComposing(true)} className="btn btn-primary btn-sm">
              <PaperPlaneTiltIcon size={14} weight="bold" />
              Send email
            </button>
          )}
        </div>

        {!contact.email ? (
          <p className="rounded-2xl bg-muted px-4 py-5 text-center text-[12.5px] text-fg-3">Add an email address for this contact to message them.</p>
        ) : (
          composing && <Compose contactId={contact.id} to={contact.email} onDone={() => setComposing(false)} />
        )}

        {contact.emails.length > 0 ? (
          <>
            <ul className="mt-3 divide-y divide-line rounded-2xl bg-muted">
              {history.pageItems.map((m) => {
                const s = STATUS[m.status];
                const expanded = open === m.id;
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : m.id)}
                      className="trow flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
                      aria-expanded={expanded}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-fg">{m.subject}</span>
                        <span className="block truncate text-[11.5px] text-fg-3">
                          {m.sentBy} · {formatRelativeDate(new Date(m.createdAt).toISOString())}
                        </span>
                      </span>
                      <Badge tone={s.tone} dot>
                        {s.label}
                      </Badge>
                      <CaretDownIcon size={13} className={cn("shrink-0 text-fg-3 transition-transform", expanded && "rotate-180")} />
                    </button>
                    {expanded && (
                      <div className="px-4 pb-4">
                        {m.error && <p className="mb-2 text-[12px] font-medium text-danger">{m.error}</p>}
                        <p className="whitespace-pre-wrap rounded-xl bg-solid p-3 text-[12.5px] text-fg-2">{m.body}</p>
                        <p className="mt-1.5 text-[11px] text-fg-3">To {m.to}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pager pagination={history} className="mt-2.5" />
          </>
        ) : (
          contact.email &&
          !composing && <p className="rounded-2xl bg-muted px-4 py-5 text-center text-[12.5px] text-fg-3">No emails sent from the app yet.</p>
        )}
      </section>
    </div>
  );
}

function ContactMeetings({ contactId, name }: { contactId: string; name: string }) {
  const meetings = useQuery(api.meetings.list, { contactId: contactId as Id<"contacts"> });
  const connected = useGoogleConnected();
  const [open, setOpen] = useState(false);
  const now = useNow();
  const upcoming = (meetings ?? []).filter((m) => m.status === "scheduled" && m.endAt >= now);
  return (
    <section>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="font-display text-[15px] font-semibold text-fg">Meetings</h3>
        {connected && (
          <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary btn-sm">
            <CalendarPlusIcon size={14} weight="bold" />
            Schedule meeting
          </button>
        )}
      </div>
      <GoogleNotice what="Scheduling meetings" className="mb-2.5" />
      {meetings !== undefined && <MeetingList meetings={upcoming} compact emptyText={`No upcoming meetings with ${name}.`} />}
      <MeetingDialog open={open} onClose={() => setOpen(false)} preset={{ title: `Meeting with ${name}`, contactId, contactIds: [contactId] }} />
    </section>
  );
}

function Detail({
  icon: IconCmp,
  label,
  children,
  className,
}: {
  icon: typeof EnvelopeSimpleIcon;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 gap-2.5", className)}>
      <IconCmp size={17} className="mt-0.5 shrink-0 text-fg-3" />
      <div className="min-w-0">
        <dt className="text-[11.5px] text-fg-3">{label}</dt>
        <dd className="mt-0.5 text-fg">{children}</dd>
      </div>
    </div>
  );
}

function Compose({ contactId, to, onDone }: { contactId: string; to: string; onDone: () => void }) {
  const send = useMutation(api.contacts.sendEmail);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await send({ id: contactId as Id<"contacts">, subject, body });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 rounded-2xl border border-line p-4">
      {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}
      <p className="text-[12px] text-fg-3">
        To <span className="font-semibold text-fg-2">{to}</span>. Replies come to your own inbox.
      </p>
      <Field label="Subject">
        <Input required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Proposal for CCTV installation" />
      </Field>
      <Field label="Message">
        <Textarea required rows={7} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" />
      </Field>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="btn btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={busy} className="btn btn-primary">
          <PaperPlaneTiltIcon size={15} weight="bold" />
          {busy ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}

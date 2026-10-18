import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer } from "./lib";
import { can } from "./permissions";
import { accessTo, logActivity } from "./projects";
import { notify } from "./notifications";
import { googleDelete, googleFetch } from "./google";

/*
 * Meetings are Google Calendar events on the company account with a Google Meet link.
 * Google emails the invites (employees and outside guests alike); employees also get an
 * in-app notification, since not every company address is a real inbox yet.
 */

const TIME_ZONE = "Africa/Accra";
const MAX_ATTENDEES = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CALENDAR = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

type Attendee = Doc<"meetings">["attendees"][number];

/** Who may see a meeting: its creator and attendees, the project's team, pipeline people for contact meetings, and managers. */
async function canSee(ctx: QueryCtx, viewer: Doc<"employees">, m: Doc<"meetings">) {
  if (can(viewer.accessRole, "projects.manageAll")) return true;
  if (m.createdBy === viewer._id || m.attendees.some((a) => a.employeeId === viewer._id)) return true;
  if (m.contactId && can(viewer.accessRole, "pipeline.view")) return true;
  if (m.projectId) {
    const project = await ctx.db.get(m.projectId);
    if (project && (await accessTo(ctx, viewer, project)).canView) return true;
  }
  return false;
}

/** Creator or a manager may change or cancel; for project meetings, the project lead too. */
async function canEdit(ctx: QueryCtx, viewer: Doc<"employees">, m: Doc<"meetings">) {
  if (m.createdBy === viewer._id || can(viewer.accessRole, "projects.manageAll")) return true;
  if (m.projectId) {
    const project = await ctx.db.get(m.projectId);
    if (project && (await accessTo(ctx, viewer, project)).canManage) return true;
  }
  return false;
}

async function shape(ctx: QueryCtx, viewer: Doc<"employees">, m: Doc<"meetings">) {
  const [creator, project, contact] = await Promise.all([
    ctx.db.get(m.createdBy),
    m.projectId ? ctx.db.get(m.projectId) : null,
    m.contactId ? ctx.db.get(m.contactId) : null,
  ]);
  return {
    id: m._id,
    title: m.title,
    description: m.description,
    startAt: m.startAt,
    endAt: m.endAt,
    attendees: m.attendees.map((a) => ({
      email: a.email,
      name: a.name ?? null,
      employeeId: a.employeeId ?? null,
      contactId: a.contactId ?? null,
    })),
    project: project ? { id: project._id, name: project.name, key: project.key } : null,
    contact: contact ? { id: contact._id, name: contact.name } : null,
    meetLink: m.meetLink ?? null,
    calendarLink: m.calendarLink ?? null,
    status: m.status,
    createdBy: creator?.name ?? "Someone",
    canEdit: await canEdit(ctx, viewer, m),
  };
}

export type MeetingView = Awaited<ReturnType<typeof shape>>;

/** Meetings the viewer can see, soonest first. Filtered to a project or contact when given. */
export const list = query({
  args: { projectId: v.optional(v.id("projects")), contactId: v.optional(v.id("contacts")) },
  handler: async (ctx, { projectId, contactId }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const rows = projectId
      ? await ctx.db.query("meetings").withIndex("by_project", (q) => q.eq("projectId", projectId)).collect()
      : contactId
        ? await ctx.db.query("meetings").withIndex("by_contact", (q) => q.eq("contactId", contactId)).collect()
        : await ctx.db.query("meetings").withIndex("by_start").collect();
    const visible: Doc<"meetings">[] = [];
    for (const m of rows) if (await canSee(ctx, viewer, m)) visible.push(m);
    visible.sort((a, b) => a.startAt - b.startAt);
    return Promise.all(visible.map((m) => shape(ctx, viewer, m)));
  },
});

/** People who can be invited: active employees and contacts with an email (contacts only for pipeline viewers). */
export const invitees = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const employees = (await ctx.db.query("employees").withIndex("by_name").collect()).filter((e) => e.status === "active");
    const contacts = can(viewer.accessRole, "pipeline.view")
      ? (await ctx.db.query("contacts").withIndex("by_name").collect()).filter((c) => c.email)
      : [];
    return {
      viewerId: viewer._id,
      employees: employees.map((e) => ({ id: e._id, name: e.name, email: e.email, jobTitle: e.jobTitle })),
      contacts: contacts.map((c) => ({ id: c._id, name: c.name, email: c.email!, company: c.company ?? null })),
    };
  },
});

// ── Scheduling (actions, because they call Google) ─────────────────────

const meetingInput = {
  title: v.string(),
  description: v.string(),
  startAt: v.number(),
  endAt: v.number(),
  employeeIds: v.array(v.id("employees")),
  contactIds: v.array(v.id("contacts")),
  guestEmails: v.array(v.string()),
};

/** Checks access and turns the picked people into a clean attendee list. */
export const prepare = internalQuery({
  args: {
    ...meetingInput,
    projectId: v.optional(v.id("projects")),
    contactId: v.optional(v.id("contacts")),
    meetingId: v.optional(v.id("meetings")),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new ConvexError("Unauthenticated");

    if (args.meetingId) {
      const m = await ctx.db.get(args.meetingId);
      if (!m || m.status === "cancelled") throw new ConvexError("That meeting no longer exists.");
      if (!(await canEdit(ctx, viewer, m))) throw new ConvexError("Only the organiser or a manager can change this meeting.");
    }
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || !(await accessTo(ctx, viewer, project)).canView) throw new ConvexError("You're not on this project.");
    }
    if ((args.contactId || args.contactIds.length) && !can(viewer.accessRole, "pipeline.view")) {
      throw new ConvexError("You don't have access to contacts.");
    }

    const title = args.title.trim();
    if (!title) throw new ConvexError("Give the meeting a title.");
    if (!(args.endAt > args.startAt)) throw new ConvexError("The meeting must end after it starts.");
    if (args.endAt - args.startAt > 12 * 3600_000) throw new ConvexError("Meetings can be at most 12 hours.");
    if (!args.meetingId && args.startAt < Date.now() - 5 * 60_000) throw new ConvexError("Pick a time in the future.");

    const byEmail = new Map<string, Attendee>();
    const add = (a: Attendee) => {
      const email = a.email.trim().toLowerCase();
      if (!byEmail.has(email)) byEmail.set(email, { ...a, email });
    };
    // The organiser in the app is always invited.
    add({ email: viewer.email, name: viewer.name, employeeId: viewer._id });
    for (const id of args.employeeIds) {
      const e = await ctx.db.get(id);
      if (e && e.status === "active") add({ email: e.email, name: e.name, employeeId: e._id });
    }
    for (const id of args.contactIds) {
      const c = await ctx.db.get(id);
      if (c?.email) add({ email: c.email, name: c.name, contactId: c._id });
    }
    for (const raw of args.guestEmails) {
      const email = raw.trim();
      if (!email) continue;
      if (!EMAIL_RE.test(email)) throw new ConvexError(`"${email}" isn't a valid email address.`);
      add({ email });
    }
    const attendees = [...byEmail.values()];
    if (attendees.length > MAX_ATTENDEES) throw new ConvexError(`Invite at most ${MAX_ATTENDEES} people.`);
    return { viewerId: viewer._id, viewerName: viewer.name, title, description: args.description.trim(), attendees };
  },
});

function eventBody(p: { title: string; description: string; startAt: number; endAt: number; attendees: Attendee[]; organiser: string }) {
  return {
    summary: p.title,
    description: [p.description, `Scheduled by ${p.organiser} via the OA Digital Command Center.`].filter(Boolean).join("\n\n"),
    start: { dateTime: new Date(p.startAt).toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: new Date(p.endAt).toISOString(), timeZone: TIME_ZONE },
    attendees: p.attendees.map((a) => ({ email: a.email, ...(a.name ? { displayName: a.name } : {}) })),
    guestsCanSeeOtherGuests: true,
    reminders: { useDefault: true },
  };
}

type GoogleEvent = { id: string; htmlLink?: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } };

function meetLinkOf(e: GoogleEvent) {
  return e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri;
}

export const schedule = action({
  args: { ...meetingInput, projectId: v.optional(v.id("projects")), contactId: v.optional(v.id("contacts")) },
  handler: async (ctx, args): Promise<Id<"meetings">> => {
    const p = await ctx.runQuery(internal.meetings.prepare, args);
    const event = await googleFetch<GoogleEvent>(ctx, `${CALENDAR}?conferenceDataVersion=1&sendUpdates=all`, {
      method: "POST",
      body: JSON.stringify({
        ...eventBody({ ...args, ...p, organiser: p.viewerName }),
        conferenceData: { createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
      }),
    });
    return await ctx.runMutation(internal.meetings.saveNew, {
      title: p.title,
      description: p.description,
      startAt: args.startAt,
      endAt: args.endAt,
      attendees: p.attendees,
      projectId: args.projectId,
      contactId: args.contactId,
      googleEventId: event.id,
      meetLink: meetLinkOf(event),
      calendarLink: event.htmlLink,
      createdBy: p.viewerId,
    });
  },
});

export const reschedule = action({
  args: { id: v.id("meetings"), ...meetingInput },
  handler: async (ctx, { id, ...args }) => {
    const existing = await ctx.runQuery(internal.meetings.row, { id });
    if (!existing) throw new ConvexError("That meeting no longer exists.");
    const p = await ctx.runQuery(internal.meetings.prepare, {
      ...args,
      meetingId: id,
      projectId: existing.projectId,
      contactId: existing.contactId,
    });
    const event = await googleFetch<GoogleEvent>(ctx, `${CALENDAR}/${existing.googleEventId}?conferenceDataVersion=1&sendUpdates=all`, {
      method: "PATCH",
      body: JSON.stringify(eventBody({ ...args, ...p, organiser: p.viewerName })),
    });
    await ctx.runMutation(internal.meetings.saveChanges, {
      id,
      title: p.title,
      description: p.description,
      startAt: args.startAt,
      endAt: args.endAt,
      attendees: p.attendees,
      meetLink: meetLinkOf(event) ?? existing.meetLink,
      actorId: p.viewerId,
    });
  },
});

export const cancel = action({
  args: { id: v.id("meetings") },
  handler: async (ctx, { id }) => {
    const check = await ctx.runQuery(internal.meetings.checkCancel, { id });
    await googleDelete(ctx, `${CALENDAR}/${check.googleEventId}?sendUpdates=all`);
    await ctx.runMutation(internal.meetings.markCancelled, { id, actorId: check.viewerId });
  },
});

// ── Internal reads/writes used by the actions ──────────────────────────

export const row = internalQuery({
  args: { id: v.id("meetings") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const checkCancel = internalQuery({
  args: { id: v.id("meetings") },
  handler: async (ctx, { id }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new ConvexError("Unauthenticated");
    const m = await ctx.db.get(id);
    if (!m || m.status === "cancelled") throw new ConvexError("That meeting is already cancelled.");
    if (!(await canEdit(ctx, viewer, m))) throw new ConvexError("Only the organiser or a manager can cancel this meeting.");
    return { viewerId: viewer._id, googleEventId: m.googleEventId };
  },
});

const attendeeValidator = v.object({
  email: v.string(),
  name: v.optional(v.string()),
  employeeId: v.optional(v.id("employees")),
  contactId: v.optional(v.id("contacts")),
});

function whenText(startAt: number) {
  return new Date(startAt).toLocaleString("en-GB", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const saveNew = internalMutation({
  args: {
    title: v.string(),
    description: v.string(),
    startAt: v.number(),
    endAt: v.number(),
    attendees: v.array(attendeeValidator),
    projectId: v.optional(v.id("projects")),
    contactId: v.optional(v.id("contacts")),
    googleEventId: v.string(),
    meetLink: v.optional(v.string()),
    calendarLink: v.optional(v.string()),
    createdBy: v.id("employees"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("meetings", { ...args, status: "scheduled", createdAt: now, updatedAt: now });
    const organiser = await ctx.db.get(args.createdBy);
    for (const a of args.attendees) {
      if (a.employeeId && a.employeeId !== args.createdBy) {
        await notify(ctx, a.employeeId, {
          title: "New meeting",
          body: `${organiser?.name ?? "Someone"} invited you to "${args.title}" on ${whenText(args.startAt)}.`,
          href: "/dashboard/meetings",
        });
      }
    }
    if (args.projectId) await logActivity(ctx, args.projectId, args.createdBy, `scheduled the meeting "${args.title}" for ${whenText(args.startAt)}`);
    return id;
  },
});

export const saveChanges = internalMutation({
  args: {
    id: v.id("meetings"),
    title: v.string(),
    description: v.string(),
    startAt: v.number(),
    endAt: v.number(),
    attendees: v.array(attendeeValidator),
    meetLink: v.optional(v.string()),
    actorId: v.id("employees"),
  },
  handler: async (ctx, { id, actorId, ...fields }) => {
    const before = await ctx.db.get(id);
    if (!before) return;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
    const actor = await ctx.db.get(actorId);
    const moved = before.startAt !== fields.startAt;
    const wasInvited = new Set(before.attendees.map((a) => a.employeeId).filter(Boolean));
    for (const a of fields.attendees) {
      if (!a.employeeId || a.employeeId === actorId) continue;
      if (!wasInvited.has(a.employeeId)) {
        await notify(ctx, a.employeeId, {
          title: "New meeting",
          body: `${actor?.name ?? "Someone"} invited you to "${fields.title}" on ${whenText(fields.startAt)}.`,
          href: "/dashboard/meetings",
        });
      } else if (moved) {
        await notify(ctx, a.employeeId, {
          title: "Meeting moved",
          body: `"${fields.title}" is now on ${whenText(fields.startAt)}.`,
          href: "/dashboard/meetings",
          tone: "warning",
        });
      }
    }
    if (before.projectId && moved) await logActivity(ctx, before.projectId, actorId, `moved the meeting "${fields.title}" to ${whenText(fields.startAt)}`);
  },
});

export const markCancelled = internalMutation({
  args: { id: v.id("meetings"), actorId: v.id("employees") },
  handler: async (ctx, { id, actorId }) => {
    const m = await ctx.db.get(id);
    if (!m) return;
    await ctx.db.patch(id, { status: "cancelled", updatedAt: Date.now() });
    for (const a of m.attendees) {
      if (a.employeeId && a.employeeId !== actorId) {
        await notify(ctx, a.employeeId, {
          title: "Meeting cancelled",
          body: `"${m.title}" on ${whenText(m.startAt)} has been cancelled.`,
          href: "/dashboard/meetings",
          tone: "danger",
        });
      }
    }
    if (m.projectId) await logActivity(ctx, m.projectId, actorId, `cancelled the meeting "${m.title}"`);
  },
});

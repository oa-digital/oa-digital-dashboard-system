import { ConvexError, v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, requirePermission, requireViewer } from "./lib";
import { can } from "./permissions";
import { notify } from "./notifications";
import { projectStatus } from "./schema";
import { internal } from "./_generated/api";

/*
 * Who can do what on a project:
 *   view   – anyone with projects.manageAll (CEO, Admin, Projects lead) or any team member
 *   manage – projects.manageAll or the project's lead: edit details, team, lead, delete docs
 *   work   – anyone who can view: create and move tasks, comment, upload documents
 */

export type ProjectAccess = { canView: boolean; canManage: boolean; isMember: boolean };

export async function accessTo(ctx: QueryCtx, viewer: Doc<"employees">, project: Doc<"projects">): Promise<ProjectAccess> {
  const membership = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_employee", (q) => q.eq("projectId", project._id).eq("employeeId", viewer._id))
    .unique();
  const all = can(viewer.accessRole, "projects.manageAll");
  const isLead = project.leadId === viewer._id;
  return { canView: all || !!membership || isLead, canManage: all || isLead, isMember: !!membership };
}

/** Loads a project and checks the viewer may `view` or `manage` it. */
export async function requireProject(ctx: QueryCtx, projectId: Id<"projects">, level: "view" | "manage") {
  const viewer = await requireViewer(ctx);
  const project = await ctx.db.get(projectId);
  if (!project) throw new ConvexError("That project no longer exists.");
  const access = await accessTo(ctx, viewer, project);
  if (!access.canView || (level === "manage" && !access.canManage)) {
    throw new ConvexError(level === "manage" ? "Only the project lead or a projects manager can do that." : "You're not on this project.");
  }
  return { viewer, project, access };
}

export async function logActivity(ctx: MutationCtx, projectId: Id<"projects">, actorId: Id<"employees">, text: string) {
  await ctx.db.insert("projectActivity", { projectId, actorId, text, createdAt: Date.now() });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function cleanDate(d: string | undefined) {
  if (!d) return undefined;
  if (!DATE_RE.test(d)) throw new ConvexError("Dates must be YYYY-MM-DD.");
  return d;
}

/** A short, unique key for task numbers: "Ashesi Portal" → "ASH", then ASH2, ASH3… */
async function makeKey(ctx: QueryCtx, name: string) {
  const letters = name.replace(/[^A-Za-z]/g, "").toUpperCase();
  const base = (letters.slice(0, 3) || "PRJ").padEnd(3, "X");
  const taken = new Set((await ctx.db.query("projects").collect()).map((p) => p.key));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

async function memberIds(ctx: QueryCtx, projectId: Id<"projects">) {
  return (await ctx.db.query("projectMembers").withIndex("by_project", (q) => q.eq("projectId", projectId)).collect()).map(
    (m) => m.employeeId,
  );
}

async function addMemberRow(ctx: MutationCtx, projectId: Id<"projects">, employeeId: Id<"employees">) {
  const existing = await ctx.db
    .query("projectMembers")
    .withIndex("by_project_employee", (q) => q.eq("projectId", projectId).eq("employeeId", employeeId))
    .unique();
  if (existing) return false;
  await ctx.db.insert("projectMembers", { projectId, employeeId, addedAt: Date.now() });
  return true;
}

function isOverdue(p: { dueDate?: string; status: string }) {
  return !!p.dueDate && p.dueDate < today() && p.status !== "completed" && p.status !== "cancelled";
}

// ── Queries ────────────────────────────────────────────────────────────

/** Projects the viewer can see, with progress. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const seeAll = can(viewer.accessRole, "projects.manageAll");
    let projects: Doc<"projects">[];
    if (seeAll) {
      projects = await ctx.db.query("projects").order("desc").collect();
    } else {
      const mine = await ctx.db.query("projectMembers").withIndex("by_employee", (q) => q.eq("employeeId", viewer._id)).collect();
      const led = await ctx.db.query("projects").withIndex("by_lead", (q) => q.eq("leadId", viewer._id)).collect();
      const ids = new Set([...mine.map((m) => m.projectId), ...led.map((p) => p._id)]);
      projects = (await Promise.all([...ids].map((id) => ctx.db.get(id)))).filter((p): p is Doc<"projects"> => !!p);
      projects.sort((a, b) => b.createdAt - a.createdAt);
    }

    const now = today();
    const rows = await Promise.all(
      projects.map(async (p) => {
        const [tasks, members, lead] = await Promise.all([
          ctx.db.query("tasks").withIndex("by_project", (q) => q.eq("projectId", p._id)).collect(),
          memberIds(ctx, p._id),
          p.leadId ? ctx.db.get(p.leadId) : null,
        ]);
        const team = (await Promise.all(members.map((id) => ctx.db.get(id)))).filter((e): e is Doc<"employees"> => !!e);
        const done = tasks.filter((t) => t.status === "done").length;
        return {
          id: p._id,
          name: p.name,
          key: p.key,
          client: p.client,
          status: p.status,
          startDate: p.startDate ?? null,
          dueDate: p.dueDate ?? null,
          overdue: isOverdue(p),
          lead: lead ? { id: lead._id, name: lead.name } : null,
          team: team.map((e) => e.name),
          tasks: {
            total: tasks.length,
            done,
            overdue: tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < now).length,
          },
          progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
          isMine: members.includes(viewer._id) || p.leadId === viewer._id,
        };
      }),
    );
    return { projects: rows, canCreate: seeAll };
  },
});

/** Everything the project page needs except tasks and documents. */
export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const project = await ctx.db.get(id);
    if (!project) return null;
    const access = await accessTo(ctx, viewer, project);
    if (!access.canView) return { forbidden: true as const };

    const [ids, tasks] = await Promise.all([
      memberIds(ctx, id),
      ctx.db.query("tasks").withIndex("by_project", (q) => q.eq("projectId", id)).collect(),
    ]);
    const members = (await Promise.all(ids.map((mid) => ctx.db.get(mid)))).filter((e): e is Doc<"employees"> => !!e);
    const deptNames = new Map<string, string>();
    for (const m of members) {
      if (m.departmentId && !deptNames.has(m.departmentId)) deptNames.set(m.departmentId, (await ctx.db.get(m.departmentId))?.name ?? "");
    }

    const now = today();
    const open = tasks.filter((t) => t.status !== "done");
    const deal = project.dealId ? await ctx.db.get(project.dealId) : null;
    const showDealMoney = can(viewer.accessRole, "pipeline.view");

    // People who could be added (managers only).
    const addable = access.canManage
      ? (await ctx.db.query("employees").withIndex("by_name").collect())
          .filter((e) => e.status === "active" && !ids.includes(e._id))
          .map((e) => ({ id: e._id, name: e.name, jobTitle: e.jobTitle }))
      : [];

    return {
      forbidden: false as const,
      id: project._id,
      name: project.name,
      key: project.key,
      client: project.client,
      description: project.description,
      status: project.status,
      startDate: project.startDate ?? null,
      dueDate: project.dueDate ?? null,
      overdue: isOverdue(project),
      leadId: project.leadId ?? null,
      canManage: access.canManage,
      viewerId: viewer._id,
      members: members
        .map((m) => ({
          id: m._id,
          name: m.name,
          jobTitle: m.jobTitle,
          department: m.departmentId ? (deptNames.get(m.departmentId) ?? null) : null,
          isLead: m._id === project.leadId,
          openTasks: open.filter((t) => t.assigneeId === m._id).length,
          doneTasks: tasks.filter((t) => t.assigneeId === m._id && t.status === "done").length,
        }))
        .sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name)),
      addable,
      stats: {
        total: tasks.length,
        byStatus: {
          todo: tasks.filter((t) => t.status === "todo").length,
          in_progress: tasks.filter((t) => t.status === "in_progress").length,
          in_review: tasks.filter((t) => t.status === "in_review").length,
          done: tasks.filter((t) => t.status === "done").length,
        },
        byPriority: {
          urgent: open.filter((t) => t.priority === "urgent").length,
          high: open.filter((t) => t.priority === "high").length,
          medium: open.filter((t) => t.priority === "medium").length,
          low: open.filter((t) => t.priority === "low").length,
        },
        overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
        unassigned: open.filter((t) => !t.assigneeId).length,
      },
      upcoming: open
        .filter((t) => t.dueDate)
        .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
        .slice(0, 6)
        .map((t) => ({
          id: t._id,
          key: `${project.key}-${t.number}`,
          title: t.title,
          dueDate: t.dueDate!,
          overdue: t.dueDate! < now,
          assignee: members.find((m) => m._id === t.assigneeId)?.name ?? null,
          priority: t.priority,
        })),
      deal: deal
        ? {
            client: deal.client,
            title: deal.title,
            value: showDealMoney ? deal.value : null,
            paid: showDealMoney ? deal.paid : null,
            currency: deal.currency,
          }
        : null,
    };
  },
});

/** A project's activity feed, newest first, a page at a time ("Load more"). */
export const activity = query({
  args: { projectId: v.id("projects"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { projectId, paginationOpts }) => {
    const viewer = await getViewer(ctx);
    const project = await ctx.db.get(projectId);
    if (!viewer || !project || !(await accessTo(ctx, viewer, project)).canView) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const result = await ctx.db
      .query("projectActivity")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (a) => ({
          id: a._id,
          actor: (await ctx.db.get(a.actorId))?.name ?? "Someone",
          text: a.text,
          createdAt: a.createdAt,
        })),
      ),
    };
  },
});

/** Deals a new project can be linked to (names only; values stay with pipeline viewers). */
export const linkableDeals = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer || !can(viewer.accessRole, "projects.manageAll")) return [];
    const deals = await ctx.db.query("deals").withIndex("by_updatedAt").order("desc").collect();
    return deals.map((d) => ({ id: d._id, label: `${d.client} · ${d.title}`, client: d.client, phase: d.phase }));
  },
});

// ── Mutations ──────────────────────────────────────────────────────────

const detailFields = {
  name: v.string(),
  client: v.string(),
  description: v.string(),
  status: projectStatus,
  startDate: v.optional(v.string()),
  dueDate: v.optional(v.string()),
};

function validateDetails(f: { name: string; startDate?: string; dueDate?: string }) {
  if (!f.name.trim()) throw new ConvexError("Give the project a name.");
  const start = cleanDate(f.startDate);
  const due = cleanDate(f.dueDate);
  if (start && due && due < start) throw new ConvexError("The due date is before the start date.");
  return { start, due };
}

export const create = mutation({
  args: {
    ...detailFields,
    leadId: v.optional(v.id("employees")),
    memberIds: v.array(v.id("employees")),
    dealId: v.optional(v.id("deals")),
  },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "projects.manageAll");
    const { start, due } = validateDetails(args);
    const name = args.name.trim();
    const id = await ctx.db.insert("projects", {
      name,
      key: await makeKey(ctx, name),
      client: args.client.trim(),
      description: args.description.trim(),
      status: args.status,
      startDate: start,
      dueDate: due,
      leadId: args.leadId,
      dealId: args.dealId,
      taskCounter: 0,
      createdBy: viewer._id,
      createdAt: Date.now(),
    });
    const team = new Set([...args.memberIds, ...(args.leadId ? [args.leadId] : [])]);
    for (const employeeId of team) {
      await addMemberRow(ctx, id, employeeId);
      if (employeeId !== viewer._id) {
        await notify(ctx, employeeId, {
          title: employeeId === args.leadId ? "You're leading a new project" : "Added to a project",
          body: `${viewer.name} added you to ${name}${employeeId === args.leadId ? " as the lead" : ""}.`,
          href: `/dashboard/projects/${id}`,
        });
      }
    }
    await logActivity(ctx, id, viewer._id, "created the project");
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("projects"), ...detailFields },
  handler: async (ctx, { id, ...args }) => {
    const { viewer, project } = await requireProject(ctx, id, "manage");
    const { start, due } = validateDetails(args);
    await ctx.db.patch(id, {
      name: args.name.trim(),
      client: args.client.trim(),
      description: args.description.trim(),
      status: args.status,
      startDate: start,
      dueDate: due,
    });
    if (project.status !== args.status) {
      await logActivity(ctx, id, viewer._id, `changed the status to ${args.status.replace("_", " ")}`);
    } else {
      await logActivity(ctx, id, viewer._id, "updated the project details");
    }
  },
});

export const setLead = mutation({
  args: { projectId: v.id("projects"), employeeId: v.id("employees") },
  handler: async (ctx, { projectId, employeeId }) => {
    const { viewer, project } = await requireProject(ctx, projectId, "manage");
    const person = await ctx.db.get(employeeId);
    if (!person || person.status !== "active") throw new ConvexError("That person isn't active.");
    await addMemberRow(ctx, projectId, employeeId);
    await ctx.db.patch(projectId, { leadId: employeeId });
    await logActivity(ctx, projectId, viewer._id, `made ${person.name} the team lead`);
    if (employeeId !== viewer._id) {
      await notify(ctx, employeeId, {
        title: "You're now the project lead",
        body: `${viewer.name} made you the lead on ${project.name}.`,
        href: `/dashboard/projects/${projectId}`,
      });
    }
  },
});

export const addMember = mutation({
  args: { projectId: v.id("projects"), employeeId: v.id("employees") },
  handler: async (ctx, { projectId, employeeId }) => {
    const { viewer, project } = await requireProject(ctx, projectId, "manage");
    const person = await ctx.db.get(employeeId);
    if (!person || person.status !== "active") throw new ConvexError("That person isn't active.");
    if (await addMemberRow(ctx, projectId, employeeId)) {
      await logActivity(ctx, projectId, viewer._id, `added ${person.name} to the team`);
      if (employeeId !== viewer._id) {
        await notify(ctx, employeeId, {
          title: "Added to a project",
          body: `${viewer.name} added you to ${project.name}.`,
          href: `/dashboard/projects/${projectId}`,
        });
      }
    }
  },
});

export const removeMember = mutation({
  args: { projectId: v.id("projects"), employeeId: v.id("employees") },
  handler: async (ctx, { projectId, employeeId }) => {
    const { viewer, project } = await requireProject(ctx, projectId, "manage");
    if (project.leadId === employeeId) throw new ConvexError("Choose a new team lead before removing the current one.");
    const row = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_employee", (q) => q.eq("projectId", projectId).eq("employeeId", employeeId))
      .unique();
    if (!row) return;
    await ctx.db.delete(row._id);
    // Their open tasks go back to unassigned so nothing silently stalls.
    const tasks = await ctx.db.query("tasks").withIndex("by_project", (q) => q.eq("projectId", projectId)).collect();
    for (const t of tasks) if (t.assigneeId === employeeId && t.status !== "done") await ctx.db.patch(t._id, { assigneeId: undefined });
    const person = await ctx.db.get(employeeId);
    await logActivity(ctx, projectId, viewer._id, `removed ${person?.name ?? "someone"} from the team`);
  },
});

/** Permanently deletes a project and everything in it (managers of all projects only). */
export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "projects.manageAll");
    const tasks = await ctx.db.query("tasks").withIndex("by_project", (q) => q.eq("projectId", id)).collect();
    for (const t of tasks) {
      for (const c of await ctx.db.query("taskComments").withIndex("by_task", (q) => q.eq("taskId", t._id)).collect()) await ctx.db.delete(c._id);
      await ctx.db.delete(t._id);
    }
    for (const d of await ctx.db.query("projectDocuments").withIndex("by_project", (q) => q.eq("projectId", id)).collect()) {
      if (d.storageId) await ctx.storage.delete(d.storageId);
      await ctx.db.delete(d._id);
    }
    for (const m of await ctx.db.query("projectMembers").withIndex("by_project", (q) => q.eq("projectId", id)).collect()) await ctx.db.delete(m._id);
    for (const a of await ctx.db.query("projectActivity").withIndex("by_project", (q) => q.eq("projectId", id)).collect()) await ctx.db.delete(a._id);
    // Meetings stay (they're real calendar events); they just stop pointing at the project.
    for (const m of await ctx.db.query("meetings").withIndex("by_project", (q) => q.eq("projectId", id)).collect()) await ctx.db.patch(m._id, { projectId: undefined });
    await ctx.db.delete(id);
  },
});

// ── Documents ──────────────────────────────────────────────────────────

export const documents = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const viewer = await getViewer(ctx);
    const project = await ctx.db.get(projectId);
    if (!viewer || !project || !(await accessTo(ctx, viewer, project)).canView) return [];
    const docs = await ctx.db.query("projectDocuments").withIndex("by_project", (q) => q.eq("projectId", projectId)).order("desc").collect();
    const canManage = (await accessTo(ctx, viewer, project)).canManage;
    return Promise.all(
      docs.map(async (d) => ({
        id: d._id,
        name: d.name,
        kind: d.storageId ? ("file" as const) : d.googleFileId ? ("google" as const) : ("link" as const),
        googleType: d.googleType ?? null,
        driveUrl: d.driveUrl ?? null,
        driveStatus: d.driveStatus ?? null,
        url: d.storageId ? await ctx.storage.getUrl(d.storageId) : (d.url ?? null),
        size: d.size ?? null,
        contentType: d.contentType ?? null,
        uploadedBy: (await ctx.db.get(d.uploadedBy))?.name ?? "Someone",
        createdAt: d.createdAt,
        canDelete: canManage || d.uploadedBy === viewer._id,
      })),
    );
  },
});

export const generateUploadUrl = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProject(ctx, projectId, "view");
    return await ctx.storage.generateUploadUrl();
  },
});

export const addDocument = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    storageId: v.optional(v.id("_storage")),
    url: v.optional(v.string()),
    size: v.optional(v.number()),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, { projectId, ...doc }) => {
    const { viewer } = await requireProject(ctx, projectId, "view");
    if (!doc.storageId && !doc.url) throw new ConvexError("Upload a file or paste a link.");
    if (doc.url && !/^https?:\/\//i.test(doc.url)) throw new ConvexError("Links must start with http:// or https://");
    const name = doc.name.trim() || "Untitled";
    // Uploads are copied to the company Drive in the background when Google is connected.
    const toDrive = !!doc.storageId && !!(await ctx.db.query("googleConnection").first());
    const id = await ctx.db.insert("projectDocuments", {
      projectId,
      ...doc,
      name,
      driveStatus: toDrive ? "pending" : undefined,
      uploadedBy: viewer._id,
      createdAt: Date.now(),
    });
    if (toDrive) await ctx.scheduler.runAfter(0, internal.drive.copyUploadToDrive, { documentId: id });
    await logActivity(ctx, projectId, viewer._id, `${doc.storageId ? "uploaded" : "linked"} "${name}"`);
  },
});

export const removeDocument = mutation({
  args: { id: v.id("projectDocuments") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return;
    const { viewer, access } = await requireProject(ctx, doc.projectId, "view");
    if (!access.canManage && doc.uploadedBy !== viewer._id) throw new ConvexError("Only the uploader or the project lead can remove this.");
    if (doc.storageId) await ctx.storage.delete(doc.storageId);
    await ctx.db.delete(id);
    await logActivity(ctx, doc.projectId, viewer._id, `removed "${doc.name}"`);
  },
});

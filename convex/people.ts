import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, optional, requirePermission } from "./lib";
import { can } from "./permissions";
import { revokeSessions } from "./users";
import { accessRole } from "./schema";

type LoginStatus = "active" | "invited" | "expired" | "none";

async function loginStatus(ctx: QueryCtx, e: Doc<"employees">): Promise<LoginStatus> {
  if (e.userId) return "active";
  const invites = await ctx.db
    .query("invites")
    .withIndex("by_employee", (q) => q.eq("employeeId", e._id))
    .collect();
  const open = invites.filter((i) => !i.usedAt);
  if (open.some((i) => i.expiresAt > Date.now())) return "invited";
  return open.length ? "expired" : "none";
}

const CLOSED_PROJECT = new Set(["completed", "cancelled"]);

/** Who works on which projects, and the open tasks on projects that are still going. */
async function workLoad(ctx: QueryCtx) {
  const [projects, members, tasks] = await Promise.all([
    ctx.db.query("projects").collect(),
    ctx.db.query("projectMembers").collect(),
    ctx.db.query("tasks").collect(),
  ]);
  const projectById = new Map(projects.map((p) => [p._id, p]));
  const projectsOf = (id: Id<"employees">) => {
    const ids = new Set(members.filter((m) => m.employeeId === id).map((m) => m.projectId));
    for (const p of projects) if (p.leadId === id) ids.add(p._id);
    return [...ids].map((pid) => projectById.get(pid)).filter((p): p is Doc<"projects"> => !!p);
  };
  const openTasksOf = (id: Id<"employees">) =>
    tasks.filter((t) => {
      const p = projectById.get(t.projectId);
      return t.assigneeId === id && t.status !== "done" && !!p && !CLOSED_PROJECT.has(p.status);
    });
  return { projectsOf, openTasksOf, tasks, projectById };
}

/** Everyone in the company, for the directory. Deal stats only for pipeline viewers. */
export const directory = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const canManage = can(viewer.accessRole, "people.manage");
    const canPipeline = can(viewer.accessRole, "pipeline.view");
    const canSeeWork = can(viewer.accessRole, "projects.manageAll");

    const [employees, departments, deals] = await Promise.all([
      ctx.db.query("employees").withIndex("by_name").collect(),
      ctx.db.query("departments").withIndex("by_name").collect(),
      canPipeline ? ctx.db.query("deals").collect() : Promise.resolve([]),
    ]);
    const work = canSeeWork ? await workLoad(ctx) : null;
    const deptName = new Map(departments.map((d) => [d._id, d.name]));
    const byId = new Map(employees.map((e) => [e._id, e]));

    const people = await Promise.all(
      employees
        .filter((e) => e.status === "active")
        .map(async (e) => {
          const owned = deals.filter((d) => d.ownerId === e._id);
          return {
            id: e._id,
            name: e.name,
            email: e.email,
            phone: e.phone,
            jobTitle: e.jobTitle,
            departmentId: e.departmentId ?? null,
            department: e.departmentId ? (deptName.get(e.departmentId) ?? null) : null,
            lineManagerId: e.lineManagerId ?? null,
            lineManager: e.lineManagerId ? (byId.get(e.lineManagerId)?.name ?? null) : null,
            accessRole: e.accessRole,
            isYou: e._id === viewer._id,
            // Only managers need to know who has signed in yet.
            loginStatus: canManage ? await loginStatus(ctx, e) : null,
            dealStats: canPipeline
              ? {
                  active: owned.filter((d) => !["done", "hold"].includes(d.phase)).length,
                  collected: owned.filter((d) => d.currency === "GHS").reduce((s, d) => s + d.paid, 0),
                }
              : null,
            workStats: work
              ? {
                  activeProjects: work.projectsOf(e._id).filter((p) => p.status === "active").length,
                  activeTasks: work.openTasksOf(e._id).length,
                }
              : null,
          };
        }),
    );

    return {
      people,
      departments: departments.map((d) => ({
        id: d._id,
        name: d.name,
        headcount: people.filter((p) => p.departmentId === d._id).length,
      })),
      canManage,
      canSetAccess: can(viewer.accessRole, "people.setAccess"),
    };
  },
});

/** One person's active projects and open tasks. For project managers, or the person themself. */
export const profile = query({
  args: { id: v.id("employees") },
  handler: async (ctx, { id }) => {
    const viewer = await getViewer(ctx);
    if (!viewer || (id !== viewer._id && !can(viewer.accessRole, "projects.manageAll"))) return null;
    const e = await ctx.db.get(id);
    if (!e) return null;
    const work = await workLoad(ctx);
    const today = new Date().toISOString().slice(0, 10);

    const projects = work
      .projectsOf(id)
      .filter((p) => p.status === "active")
      .map((p) => {
        const tasks = work.tasks.filter((t) => t.projectId === p._id);
        const done = tasks.filter((t) => t.status === "done").length;
        return {
          id: p._id,
          name: p.name,
          key: p.key,
          client: p.client,
          isLead: p.leadId === id,
          dueDate: p.dueDate ?? null,
          overdue: !!p.dueDate && p.dueDate < today,
          progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
        };
      })
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

    const tasks = work
      .openTasksOf(id)
      .map((t) => {
        const p = work.projectById.get(t.projectId)!;
        return {
          id: t._id,
          projectId: t.projectId,
          project: p.name,
          key: `${p.key}-${t.number}`,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate ?? null,
          overdue: !!t.dueDate && t.dueDate < today,
        };
      })
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

    return { id: e._id, name: e.name, jobTitle: e.jobTitle, email: e.email, projects, tasks };
  },
});

const editableFields = {
  name: v.string(),
  jobTitle: v.string(),
  phone: v.optional(v.string()),
  departmentId: v.optional(v.id("departments")),
  lineManagerId: v.optional(v.id("employees")),
};

/** Rejects a line manager that is the person themself or reports to them (a loop). */
async function assertValidLineManager(ctx: QueryCtx, employeeId: Id<"employees"> | null, managerId?: Id<"employees">) {
  if (!managerId) return;
  if (managerId === employeeId) throw new ConvexError("Someone can't be their own line manager.");
  let cursor: Id<"employees"> | undefined = managerId;
  for (let i = 0; cursor && i < 50; i++) {
    const m: Doc<"employees"> | null = await ctx.db.get(cursor);
    if (!m) throw new ConvexError("That line manager no longer exists.");
    if (employeeId && m.lineManagerId === employeeId) {
      throw new ConvexError("That would create a loop: the manager already reports to this person.");
    }
    cursor = m.lineManagerId;
  }
}

export const create = mutation({
  args: { ...editableFields, email: v.string(), accessRole: v.optional(accessRole) },
  handler: async (ctx, args) => {
    const viewer = await requirePermission(ctx, "people.manage");
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Enter a valid email address.");
    const clash = await ctx.db.query("employees").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (clash) throw new ConvexError(`${clash.name} already uses that email.`);
    // Only someone who can set access levels may create anyone above staff.
    const role = args.accessRole && can(viewer.accessRole, "people.setAccess") ? args.accessRole : "staff";
    await assertValidLineManager(ctx, null, args.lineManagerId);
    return await ctx.db.insert("employees", {
      name: args.name.trim(),
      email,
      phone: optional(args.phone),
      jobTitle: args.jobTitle.trim() || "Team member",
      departmentId: args.departmentId,
      lineManagerId: args.lineManagerId,
      accessRole: role,
      status: "active",
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: { id: v.id("employees"), ...editableFields },
  handler: async (ctx, { id, ...args }) => {
    await requirePermission(ctx, "people.manage");
    await assertValidLineManager(ctx, id, args.lineManagerId);
    const name = args.name.trim();
    await ctx.db.patch(id, {
      name,
      jobTitle: args.jobTitle.trim() || "Team member",
      phone: optional(args.phone),
      departmentId: args.departmentId,
      lineManagerId: args.lineManagerId,
    });
    // Keep the display name on owned deals in sync.
    const owned = await ctx.db.query("deals").collect();
    for (const d of owned) if (d.ownerId === id && d.assignee !== name) await ctx.db.patch(d._id, { assignee: name });
  },
});

export const setAccess = mutation({
  args: { id: v.id("employees"), accessRole },
  handler: async (ctx, { id, accessRole: role }) => {
    const viewer = await requirePermission(ctx, "people.setAccess");
    if (id === viewer._id && role !== "ceo") {
      throw new ConvexError("You can't remove your own CEO access. Ask another CEO-level person.");
    }
    await ctx.db.patch(id, { accessRole: role });
  },
});

/** Removes someone from the company: hides them and signs them out. History stays intact. */
export const deactivate = mutation({
  args: { id: v.id("employees") },
  handler: async (ctx, { id }) => {
    const viewer = await requirePermission(ctx, "people.manage");
    if (id === viewer._id) throw new ConvexError("You can't remove yourself.");
    const target = await ctx.db.get(id);
    if (!target) return;
    if (target.accessRole === "ceo" && !can(viewer.accessRole, "people.setAccess")) {
      throw new ConvexError("Only the CEO can remove a CEO-level account.");
    }
    await ctx.db.patch(id, { status: "disabled" });
    // Anyone who reported to them now has no line manager until reassigned.
    const reports = await ctx.db.query("employees").collect();
    for (const r of reports) if (r.lineManagerId === id) await ctx.db.patch(r._id, { lineManagerId: undefined });
    if (target.userId) await revokeSessions(ctx, target.userId);
  },
});

export const createDepartment = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    await requirePermission(ctx, "people.manage");
    const clean = name.trim();
    if (!clean) throw new ConvexError("Give the department a name.");
    const clash = await ctx.db.query("departments").withIndex("by_name", (q) => q.eq("name", clean)).first();
    if (clash) throw new ConvexError("That department already exists.");
    return await ctx.db.insert("departments", { name: clean, createdAt: Date.now() });
  },
});

export const renameDepartment = mutation({
  args: { id: v.id("departments"), name: v.string() },
  handler: async (ctx, { id, name }) => {
    await requirePermission(ctx, "people.manage");
    const clean = name.trim();
    if (!clean) throw new ConvexError("Give the department a name.");
    await ctx.db.patch(id, { name: clean });
  },
});

export const deleteDepartment = mutation({
  args: { id: v.id("departments") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "people.manage");
    const members = await ctx.db.query("employees").withIndex("by_department", (q) => q.eq("departmentId", id)).collect();
    if (members.some((m) => m.status === "active")) {
      throw new ConvexError("Move everyone out of this department before deleting it.");
    }
    await ctx.db.delete(id);
  },
});

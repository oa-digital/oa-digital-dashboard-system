import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getViewer } from "./lib";

type Tone = "info" | "success" | "warning" | "danger";

/** Adds an in-app notification for one person. */
export async function notify(
  ctx: MutationCtx,
  employeeId: Id<"employees">,
  n: { title: string; body: string; href: string; tone?: Tone },
) {
  await ctx.db.insert("notifications", { employeeId, tone: "info", ...n, createdAt: Date.now() });
}

/** The viewer's notifications, newest first, a page at a time ("Load more"). */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return { page: [], isDone: true, continueCursor: "" };
    const result = await ctx.db
      .query("notifications")
      .withIndex("by_employee", (q) => q.eq("employeeId", viewer._id))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map((n) => ({
        id: n._id,
        title: n.title,
        body: n.body,
        href: n.href,
        tone: n.tone,
        read: Boolean(n.readAt),
        createdAt: n.createdAt,
      })),
    };
  },
});

/** How many of the viewer's notifications are unread (the bell badge). */
export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return 0;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_employee", (q) => q.eq("employeeId", viewer._id))
      .filter((q) => q.eq(q.field("readAt"), undefined))
      .collect();
    return unread.length;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_employee", (q) => q.eq("employeeId", viewer._id))
      .filter((q) => q.eq(q.field("readAt"), undefined))
      .collect();
    const now = Date.now();
    for (const n of unread) await ctx.db.patch(n._id, { readAt: now });
  },
});

export const dismiss = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    const viewer = await getViewer(ctx);
    const n = await ctx.db.get(id);
    if (viewer && n && n.employeeId === viewer._id) await ctx.db.delete(id);
  },
});

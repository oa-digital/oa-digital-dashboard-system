import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { optional, requirePermission, viewerWith } from "./lib";

function toContact(c: Doc<"contacts">) {
  return {
    id: c._id,
    name: c.name,
    company: c.company,
    email: c.email,
    phone: c.phone,
    notes: c.notes,
    tags: c.tags,
    createdAt: new Date(c.createdAt).toISOString(),
  };
}

export type ContactView = ReturnType<typeof toContact>;

/** All contacts, alphabetical. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await viewerWith(ctx, "pipeline.view"))) return [];
    const rows = await ctx.db.query("contacts").withIndex("by_name").collect();
    return rows.map(toContact);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "pipeline.view");
    return await ctx.db.insert("contacts", {
      name: args.name.trim(),
      company: optional(args.company),
      email: optional(args.email),
      phone: optional(args.phone),
      notes: optional(args.notes),
      tags: args.tags.map((t) => t.trim()).filter(Boolean),
      createdAt: Date.now(),
    });
  },
});

/** One contact with the emails sent to them from the app, newest first. */
export const get = query({
  args: { id: v.id("contacts") },
  handler: async (ctx, { id }) => {
    if (!(await viewerWith(ctx, "pipeline.view"))) return null;
    const c = await ctx.db.get(id);
    if (!c) return null;
    const emails = await ctx.db.query("contactEmails").withIndex("by_contact", (q) => q.eq("contactId", id)).order("desc").collect();
    return {
      ...toContact(c),
      emails: await Promise.all(
        emails.map(async (m) => ({
          id: m._id,
          to: m.to,
          subject: m.subject,
          body: m.body,
          status: m.status,
          error: m.error ?? null,
          sentBy: (await ctx.db.get(m.sentBy))?.name ?? "Someone",
          createdAt: m.createdAt,
        })),
      ),
    };
  },
});

/** Emails a contact from the app. Replies go to the sender's own address. */
export const sendEmail = mutation({
  args: { id: v.id("contacts"), subject: v.string(), body: v.string() },
  handler: async (ctx, { id, subject, body }) => {
    const viewer = await requirePermission(ctx, "pipeline.view");
    const contact = await ctx.db.get(id);
    if (!contact) throw new ConvexError("That contact no longer exists.");
    if (!contact.email) throw new ConvexError("Add an email address for this contact first.");
    const cleanSubject = subject.trim();
    const cleanBody = body.trim();
    if (!cleanSubject) throw new ConvexError("Add a subject.");
    if (!cleanBody) throw new ConvexError("Write a message.");
    if (cleanSubject.length > 200) throw new ConvexError("Keep the subject under 200 characters.");
    if (cleanBody.length > 20000) throw new ConvexError("That message is too long.");
    const messageId = await ctx.db.insert("contactEmails", {
      contactId: id,
      to: contact.email,
      subject: cleanSubject,
      body: cleanBody,
      sentBy: viewer._id,
      status: "sending",
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.email.sendContactEmail, { messageId });
    return messageId;
  },
});

export const messageForSending = internalQuery({
  args: { messageId: v.id("contactEmails") },
  handler: async (ctx, { messageId }) => {
    const m = await ctx.db.get(messageId);
    if (!m || m.status !== "sending") return null;
    const sender = await ctx.db.get(m.sentBy);
    return {
      to: m.to,
      subject: m.subject,
      body: m.body,
      senderName: sender?.name ?? "OA Digital",
      senderTitle: sender?.jobTitle ?? "",
      senderEmail: sender?.email,
    };
  },
});

export const markMessage = internalMutation({
  args: { messageId: v.id("contactEmails"), status: v.union(v.literal("sent"), v.literal("failed")), error: v.optional(v.string()) },
  handler: async (ctx, { messageId, status, error }) => {
    await ctx.db.patch(messageId, { status, error, sentAt: status === "sent" ? Date.now() : undefined });
  },
});

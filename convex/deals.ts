import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { optional, requirePermission, viewerWith } from "./lib";
import { currency, phase } from "./schema";

const dealFields = {
  client: v.string(),
  title: v.string(),
  value: v.number(),
  currency,
  phase,
  ownerId: v.optional(v.id("employees")),
  nextAction: v.string(),
  notes: v.string(),
};

async function ownerName(ctx: QueryCtx, ownerId: Id<"employees"> | undefined) {
  return ownerId ? ((await ctx.db.get(ownerId))?.name ?? "") : "";
}

async function linkedPayments(ctx: QueryCtx, dealId: Id<"deals">) {
  return await ctx.db.query("transactions").withIndex("by_deal", (q) => q.eq("dealId", dealId)).collect();
}

const sum = (rows: Doc<"transactions">[]) => rows.reduce((s, t) => s + t.amount, 0);

/**
 * Runs `change` (which adds, removes or relinks payment transactions for `dealId`) and then
 * recomputes the deal's `paid`. Deals from before payments were tracked keep what they had
 * collected as `paidOpening`, captured here the first time their payments change.
 */
export async function withDealPaid(ctx: MutationCtx, dealId: Id<"deals">, change: () => Promise<void>) {
  const deal = await ctx.db.get(dealId);
  if (!deal) throw new ConvexError("That deal no longer exists.");
  const opening = deal.paidOpening ?? Math.max(0, deal.paid - sum(await linkedPayments(ctx, dealId)));
  await change();
  const paid = opening + sum(await linkedPayments(ctx, dealId));
  await ctx.db.patch(dealId, { paid, paidOpening: opening, updatedAt: Date.now() });
}

/** Payments must be money in, in the deal's currency. */
export function assertPaymentFits(deal: Doc<"deals">, t: { type: string; currency: string }) {
  if (t.type !== "payment_received" && t.type !== "income") {
    throw new ConvexError("Only money coming in can be linked to a deal.");
  }
  if (t.currency !== deal.currency) {
    throw new ConvexError(`This deal is in ${deal.currency}. Record the payment in ${deal.currency}.`);
  }
}

function toDeal(d: Doc<"deals">) {
  return {
    id: d._id,
    client: d.client,
    title: d.title,
    value: d.value,
    currency: d.currency,
    phase: d.phase,
    assignee: d.assignee,
    ownerId: d.ownerId ?? null,
    paid: d.paid,
    paidOpening: d.paidOpening ?? null,
    nextAction: d.nextAction,
    notes: d.notes,
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
  };
}

export type DealView = ReturnType<typeof toDeal>;

/** All deals, most recently updated first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await viewerWith(ctx, "pipeline.view"))) return [];
    const rows = await ctx.db.query("deals").withIndex("by_updatedAt").order("desc").collect();
    return rows.map(toDeal);
  },
});

/** Payments recorded against a deal, newest first, plus what was collected before tracking. */
export const payments = query({
  args: { id: v.id("deals") },
  handler: async (ctx, { id }) => {
    if (!(await viewerWith(ctx, "pipeline.view"))) return null;
    const deal = await ctx.db.get(id);
    if (!deal) return null;
    const rows = await linkedPayments(ctx, id);
    rows.sort((a, b) => b.date.localeCompare(a.date) || b._creationTime - a._creationTime);
    return {
      opening: deal.paidOpening ?? Math.max(0, deal.paid - sum(rows)),
      payments: rows.map((t) => ({ id: t._id, amount: t.amount, currency: t.currency, date: t.date, description: t.description })),
    };
  },
});

export const create = mutation({
  args: dealFields,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "pipeline.view");
    const now = Date.now();
    return await ctx.db.insert("deals", {
      ...args,
      assignee: await ownerName(ctx, args.ownerId),
      paid: 0,
      paidOpening: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { id: v.id("deals"), ...dealFields },
  handler: async (ctx, { id, ...fields }) => {
    await requirePermission(ctx, "pipeline.view");
    const deal = await ctx.db.get(id);
    if (!deal) throw new ConvexError("That deal no longer exists.");
    if (fields.currency !== deal.currency && (await linkedPayments(ctx, id)).length > 0) {
      throw new ConvexError(`Payments are already recorded in ${deal.currency}, so the currency can't change.`);
    }
    await ctx.db.patch(id, { ...fields, assignee: await ownerName(ctx, fields.ownerId), updatedAt: Date.now() });
  },
});

/** Removes a deal. Its payments stay in Finance (the money was received), just unlinked. */
export const remove = mutation({
  args: { id: v.id("deals") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "pipeline.view");
    for (const t of await linkedPayments(ctx, id)) await ctx.db.patch(t._id, { dealId: undefined });
    await ctx.db.delete(id);
  },
});

/** Records a client payment: a "Payment received" transaction in Finance, linked to the deal. */
export const recordPayment = mutation({
  args: { id: v.id("deals"), amount: v.number(), date: v.optional(v.string()), note: v.optional(v.string()) },
  handler: async (ctx, { id, amount, date, note }) => {
    await requirePermission(ctx, "pipeline.view");
    if (!(amount > 0)) throw new ConvexError("Enter an amount above zero.");
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ConvexError("Dates must be YYYY-MM-DD.");
    const deal = await ctx.db.get(id);
    if (!deal) throw new ConvexError("That deal no longer exists.");
    await withDealPaid(ctx, id, async () => {
      await ctx.db.insert("transactions", {
        type: "payment_received",
        description: optional(note) ?? `${deal.client}: ${deal.title}`,
        amount,
        currency: deal.currency,
        person: deal.client,
        category: "Client Payment",
        date: date ?? new Date().toISOString().slice(0, 10),
        dealId: id,
      });
    });
  },
});

/** Deletes a payment recorded against a deal, which also removes it from Finance. */
export const removePayment = mutation({
  args: { transactionId: v.id("transactions") },
  handler: async (ctx, { transactionId }) => {
    await requirePermission(ctx, "pipeline.view");
    const t = await ctx.db.get(transactionId);
    if (!t?.dealId) throw new ConvexError("That payment no longer exists.");
    await withDealPaid(ctx, t.dealId, async () => {
      await ctx.db.delete(transactionId);
    });
  },
});

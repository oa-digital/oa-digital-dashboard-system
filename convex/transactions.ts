import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { optional, requirePermission, viewerWith } from "./lib";
import { currency, transactionType } from "./schema";
import { assertPaymentFits, withDealPaid } from "./deals";

function toTransaction(t: Doc<"transactions">) {
  return {
    id: t._id,
    type: t.type,
    description: t.description,
    amount: t.amount,
    currency: t.currency,
    person: t.person,
    category: t.category,
    date: t.date,
    orderId: t.orderId,
    dealId: t.dealId ?? null,
  };
}

export type TransactionView = ReturnType<typeof toTransaction>;

/** All transactions, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await viewerWith(ctx, "finance.view"))) return [];
    const rows = await ctx.db.query("transactions").withIndex("by_date").order("desc").collect();
    return rows.map(toTransaction);
  },
});

export const create = mutation({
  args: {
    type: transactionType,
    description: v.string(),
    amount: v.number(),
    currency,
    category: v.string(),
    person: v.optional(v.string()),
    date: v.optional(v.string()),
    dealId: v.optional(v.id("deals")),
  },
  handler: async (ctx, args) => {
    await requirePermission(ctx, "finance.view");
    const row = {
      type: args.type,
      description: args.description.trim(),
      amount: args.amount,
      currency: args.currency,
      category: args.category,
      person: optional(args.person),
      date: args.date ?? new Date().toISOString().slice(0, 10),
    };
    if (!args.dealId) return await ctx.db.insert("transactions", row);

    const dealId = args.dealId;
    const deal = await ctx.db.get(dealId);
    if (!deal) throw new ConvexError("That deal no longer exists.");
    assertPaymentFits(deal, args);
    let id: Id<"transactions"> | null = null;
    await withDealPaid(ctx, dealId, async () => {
      id = await ctx.db.insert("transactions", { ...row, person: row.person ?? deal.client, dealId });
    });
    return id!;
  },
});

/** Deletes a transaction. A payment linked to a deal comes off that deal's paid amount too. */
export const remove = mutation({
  args: { id: v.id("transactions") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, "finance.view");
    const t = await ctx.db.get(id);
    if (!t) return;
    const claims = await ctx.db.query("expenseClaims").withIndex("by_status", (q) => q.eq("status", "approved")).collect();
    if (claims.some((c) => c.transactionId === id)) {
      throw new ConvexError("This is the payout for an expense claim, so it can't be deleted here.");
    }
    if (t.dealId && (await ctx.db.get(t.dealId))) {
      await withDealPaid(ctx, t.dealId, async () => {
        await ctx.db.delete(id);
      });
    } else {
      await ctx.db.delete(id);
    }
  },
});

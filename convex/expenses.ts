import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, optional, requirePermission, requireViewer } from "./lib";
import { can } from "./permissions";
import { buildChain, describeSteps, notifyFirstApprover, previewRoute, stepLabel } from "./approvals";
import { notify } from "./notifications";
import { currency } from "./schema";

export const EXPENSE_CATEGORIES = [
  "Travel & transport",
  "Fuel",
  "Meals",
  "Accommodation",
  "Equipment",
  "Software & subscriptions",
  "Internet & phone",
  "Client entertainment",
  "Office supplies",
  "Other",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RECEIPTS = 5;
const MAX_PROOF = 5;
const file = v.object({ storageId: v.id("_storage"), name: v.string() });

async function toAttachments(ctx: QueryCtx, files: { storageId: Id<"_storage">; name: string }[]) {
  return await Promise.all(
    files.map(async (r) => {
      const type = (await ctx.db.system.get(r.storageId))?.contentType ?? "";
      return {
        name: r.name,
        url: await ctx.storage.getUrl(r.storageId),
        isImage: type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(r.name),
        isPdf: type.includes("pdf") || /\.pdf$/i.test(r.name),
      };
    }),
  );
}

async function shapeClaim(ctx: QueryCtx, c: Doc<"expenseClaims">) {
  const employee = await ctx.db.get(c.employeeId);
  // Only a request that is still pending is waiting on anyone (withdrawn ones keep their old steps).
  const pendingStep = c.status === "pending" ? c.steps.find((s) => s.status === "pending") : undefined;
  const paidBy = c.paidBy ? await ctx.db.get(c.paidBy) : null;
  return {
    id: c._id,
    employee: employee?.name ?? "Unknown",
    employeeId: c.employeeId,
    title: c.title,
    currency: c.currency,
    items: c.items,
    total: c.total,
    receipts: await toAttachments(ctx, c.receipts),
    paymentProof: await toAttachments(ctx, c.paymentProof ?? []),
    paymentReference: c.paymentReference ?? null,
    // "paid" is a stage after "approved"; the stored status stays "approved".
    status: c.paidAt ? ("paid" as const) : c.status,
    currentStep: pendingStep
      ? `${stepLabel(pendingStep.kind)} · ${(await ctx.db.get(pendingStep.approverId))?.name ?? ""}`
      : c.status === "approved" && !c.paidAt
        ? "Waiting for payment"
        : null,
    steps: await describeSteps(ctx, c.steps),
    paidAt: c.paidAt ?? null,
    paidBy: paidBy?.name ?? null,
    createdAt: c.createdAt,
    canWithdraw: c.status === "pending",
  };
}

function summarise(claims: Awaited<ReturnType<typeof shapeClaim>>[]) {
  const year = new Date().getFullYear();
  const sum = (xs: typeof claims) => xs.reduce((s, c) => s + c.total, 0);
  const inApproval = claims.filter((c) => c.status === "pending");
  const toPay = claims.filter((c) => c.status === "approved");
  const paidThisYear = claims.filter((c) => c.status === "paid" && c.paidAt && new Date(c.paidAt).getFullYear() === year);
  return {
    inApproval: { count: inApproval.length, total: sum(inApproval) },
    toPay: { count: toPay.length, total: sum(toPay) },
    paidThisYear: { count: paidThisYear.length, total: sum(paidThisYear) },
    all: claims.length,
  };
}

/** The viewer's claims. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const rows = await ctx.db.query("expenseClaims").withIndex("by_employee", (q) => q.eq("employeeId", viewer._id)).order("desc").collect();
    const claims = await Promise.all(rows.map((c) => shapeClaim(ctx, c)));
    return { claims, summary: summarise(claims), categories: EXPENSE_CATEGORIES, autoApproved: viewer.accessRole === "ceo", route: await previewRoute(ctx, viewer, "ceo_only") };
  },
});

/** Every claim in the company: for finance (who pays) and HR. */
export const all = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer || !(can(viewer.accessRole, "finance.view") || can(viewer.accessRole, "hr.manage"))) return null;
    const rows = await ctx.db.query("expenseClaims").order("desc").collect();
    const claims = await Promise.all(rows.map((c) => shapeClaim(ctx, c)));
    return { claims, summary: summarise(claims), canPay: can(viewer.accessRole, "finance.view") };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireViewer(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const submit = mutation({
  args: {
    title: v.string(),
    currency,
    items: v.array(v.object({ date: v.string(), category: v.string(), description: v.string(), amount: v.number() })),
    receipts: v.array(v.object({ storageId: v.id("_storage"), name: v.string() })),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx);
    const title = args.title.trim();
    if (!title) throw new ConvexError("Give the claim a short title.");
    if (args.items.length === 0) throw new ConvexError("Add at least one expense.");
    if (args.receipts.length > MAX_RECEIPTS) throw new ConvexError(`Attach up to ${MAX_RECEIPTS} receipts.`);
    for (const item of args.items) {
      if (!DATE_RE.test(item.date)) throw new ConvexError("Every expense needs a date.");
      if (!item.description.trim()) throw new ConvexError("Describe every expense.");
      if (!(item.amount > 0)) throw new ConvexError("Every expense needs an amount above zero.");
    }
    const items = args.items.map((i) => ({ ...i, description: i.description.trim(), amount: Math.round(i.amount * 100) / 100 }));
    const total = Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100;

    // Expense claims go straight to the CEO (no line manager step).
    const chain = await buildChain(ctx, viewer, "ceo_only");
    const id = await ctx.db.insert("expenseClaims", {
      employeeId: viewer._id,
      title,
      currency: args.currency,
      items,
      total,
      receipts: args.receipts,
      ...chain,
      createdAt: Date.now(),
      decidedAt: chain.status === "approved" ? Date.now() : undefined,
    });
    await notifyFirstApprover(ctx, chain.currentApproverId, viewer, `an expense claim "${title}" (${args.currency} ${total.toFixed(2)})`);
    return id;
  },
});

export const withdraw = mutation({
  args: { id: v.id("expenseClaims") },
  handler: async (ctx, { id }) => {
    const viewer = await requireViewer(ctx);
    const c = await ctx.db.get(id);
    if (!c || c.employeeId !== viewer._id) throw new ConvexError("That isn't your claim.");
    if (c.status !== "pending") throw new ConvexError("Only claims still in approval can be withdrawn.");
    await ctx.db.patch(id, { status: "withdrawn", currentApproverId: undefined, decidedAt: Date.now() });
  },
});

/**
 * Finance marks an approved claim as paid, optionally with proof (invoice, transfer slip)
 * and a reference. This also records it as an expense in Finance.
 */
export const markPaid = mutation({
  args: { id: v.id("expenseClaims"), proof: v.optional(v.array(file)), reference: v.optional(v.string()) },
  handler: async (ctx, { id, proof = [], reference }) => {
    const viewer = await requirePermission(ctx, "finance.view");
    const c = await ctx.db.get(id);
    if (!c) throw new ConvexError("Claim not found.");
    if (c.status !== "approved" || c.paidAt) throw new ConvexError("Only approved, unpaid claims can be marked paid.");
    const employee = await ctx.db.get(c.employeeId);
    const now = Date.now();
    const transactionId = await ctx.db.insert("transactions", {
      type: "expense",
      description: `Expense claim: ${c.title}`,
      amount: c.total,
      currency: c.currency,
      person: employee?.name,
      category: "Expense claims",
      date: new Date(now).toISOString().slice(0, 10),
    });
    if (proof.length > MAX_PROOF) throw new ConvexError(`Attach up to ${MAX_PROOF} files as proof.`);
    await ctx.db.patch(id, {
      paidAt: now,
      paidBy: viewer._id,
      transactionId,
      paymentProof: proof.length ? proof : undefined,
      paymentReference: optional(reference),
    });
    await notify(ctx, c.employeeId, {
      title: "Expense claim paid",
      body: `"${c.title}" (${c.currency} ${c.total.toFixed(2)}) has been paid.${proof.length ? " Proof of payment is attached." : ""}`,
      href: "/dashboard/expenses",
      tone: "success",
    });
  },
});

import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getViewer, requireViewer } from "./lib";
import { can } from "./permissions";
import { notify } from "./notifications";
import type { approvalStep } from "./schema";

/*
 * Approval chains:
 *   "line_manager_then_ceo" (leave and most requests):  line manager  →  CEO
 *   "ceo_only" (expense claims):                         CEO
 * - The CEO's own requests need no approval.
 * - If the line manager is the CEO, there is a single CEO step.
 * - The CEO may decide any pending request at any step (so nothing gets stuck if a
 *   manager is away or leaves); deciding on someone's behalf completes their step too.
 */

export type Step = Infer<typeof approvalStep>;
export type Route = "line_manager_then_ceo" | "ceo_only";
type Chain = { steps: Step[]; status: "pending" | "approved"; currentApproverId?: Id<"employees"> };

export async function findCeo(ctx: QueryCtx) {
  return (await ctx.db.query("employees").collect()).find((e) => e.accessRole === "ceo" && e.status === "active") ?? null;
}

/** The approval steps for a new request by `employee`. */
export async function buildChain(ctx: QueryCtx, employee: Doc<"employees">, route: Route = "line_manager_then_ceo"): Promise<Chain> {
  if (employee.accessRole === "ceo") return { steps: [], status: "approved" };
  const ceo = await findCeo(ctx);
  const steps: Step[] = [];
  if (route === "line_manager_then_ceo") {
    const manager = employee.lineManagerId ? await ctx.db.get(employee.lineManagerId) : null;
    if (manager && manager.status === "active" && manager._id !== ceo?._id) {
      steps.push({ approverId: manager._id, kind: "line_manager", status: "pending" });
    }
  }
  if (ceo) steps.push({ approverId: ceo._id, kind: "ceo", status: "pending" });
  if (steps.length === 0) {
    throw new ConvexError(
      route === "ceo_only" ? "There's no CEO account to approve this yet." : "There's nobody to approve this yet. Ask HR to set your line manager.",
    );
  }
  return { steps, status: "pending", currentApproverId: steps[0].approverId };
}

/** Names of who a new request from `employee` would go to, in order (empty for the CEO). */
export async function previewRoute(ctx: QueryCtx, employee: Doc<"employees">, route: Route = "line_manager_then_ceo") {
  try {
    const { steps } = await buildChain(ctx, employee, route);
    return Promise.all(steps.map(async (s) => (await ctx.db.get(s.approverId))?.name ?? "Unknown"));
  } catch {
    return [];
  }
}

/** Applies `viewer`'s decision to a pending chain. Returns the new chain state. */
export function decideChain(
  steps: Step[],
  viewer: Doc<"employees">,
  decision: "approve" | "decline",
  note: string | undefined,
): { steps: Step[]; status: "pending" | "approved" | "declined"; currentApproverId?: Id<"employees"> } {
  const idx = steps.findIndex((s) => s.status === "pending");
  if (idx === -1) throw new ConvexError("This request has already been decided.");
  const isCeo = viewer.accessRole === "ceo";
  if (steps[idx].approverId !== viewer._id && !isCeo) throw new ConvexError("This isn't waiting on you.");

  const now = Date.now();
  const next = steps.map((s) => ({ ...s }));
  if (decision === "decline") {
    next[idx] = { ...next[idx], status: "declined", decidedAt: now, decidedBy: viewer._id, note };
    for (let i = idx + 1; i < next.length; i++) next[i].status = "skipped";
    return { steps: next, status: "declined", currentApproverId: undefined };
  }
  // The CEO approving clears every remaining step (their sign-off is final).
  const last = isCeo ? next.length - 1 : idx;
  for (let i = idx; i <= last; i++) {
    next[i] = { ...next[i], status: i === idx || next[i].approverId === viewer._id ? "approved" : "skipped", decidedAt: now, decidedBy: viewer._id };
  }
  next[idx].note = note;
  next[last].status = "approved";
  const remaining = next.find((s) => s.status === "pending");
  return remaining
    ? { steps: next, status: "pending", currentApproverId: remaining.approverId }
    : { steps: next, status: "approved", currentApproverId: undefined };
}

/** Human-readable steps for the UI. */
export async function describeSteps(ctx: QueryCtx, steps: Step[]) {
  return Promise.all(
    steps.map(async (s) => ({
      kind: s.kind,
      status: s.status,
      approver: (await ctx.db.get(s.approverId))?.name ?? "Former employee",
      decidedBy: s.decidedBy && s.decidedBy !== s.approverId ? ((await ctx.db.get(s.decidedBy))?.name ?? null) : null,
      decidedAt: s.decidedAt ?? null,
      note: s.note ?? null,
    })),
  );
}

export function stepLabel(kind: Step["kind"]) {
  return kind === "line_manager" ? "Line manager" : "CEO";
}

// ── Inbox ──────────────────────────────────────────────────────────────

type InboxItem = {
  kind: "leave" | "expense";
  id: string;
  requester: string;
  requesterTitle: string;
  title: string;
  detail: string;
  amount: number | null;
  currency: string | null;
  step: string;
  onBehalfOf: string | null; // set when the CEO sees something waiting on someone else
  createdAt: number;
  reason: string;
  /** Expense lines, so approvers can see what each amount was for. */
  items: { date: string; category: string; description: string; amount: number }[];
  /** Proof uploaded with the request (receipts). URLs are only returned to people who can see the request. */
  attachments: { name: string; url: string | null; isImage: boolean; isPdf: boolean }[];
  /** The viewer can approve and pay this in one go (expense claims, for whoever pays). */
  canPay: boolean;
};

async function leaveItem(ctx: QueryCtx, r: Doc<"leaveRequests">, viewerId: Id<"employees">): Promise<InboxItem> {
  const [who, type] = await Promise.all([ctx.db.get(r.employeeId), ctx.db.get(r.leaveTypeId)]);
  const step = r.steps.find((s) => s.status === "pending");
  return {
    kind: "leave",
    id: r._id,
    requester: who?.name ?? "Unknown",
    requesterTitle: who?.jobTitle ?? "",
    title: type?.name ?? "Leave",
    detail: `${r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`} · ${r.days} day${r.days !== 1 ? "s" : ""}`,
    amount: null,
    currency: null,
    step: step ? stepLabel(step.kind) : "",
    onBehalfOf: step && step.approverId !== viewerId ? ((await ctx.db.get(step.approverId))?.name ?? null) : null,
    createdAt: r.createdAt,
    reason: r.reason,
    items: [],
    attachments: [],
    canPay: false,
  };
}

async function expenseItem(ctx: QueryCtx, c: Doc<"expenseClaims">, viewerId: Id<"employees">, canPay = false): Promise<InboxItem> {
  const who = await ctx.db.get(c.employeeId);
  const step = c.steps.find((s) => s.status === "pending");
  return {
    kind: "expense",
    id: c._id,
    requester: who?.name ?? "Unknown",
    requesterTitle: who?.jobTitle ?? "",
    title: c.title,
    detail: `${c.items.length} item${c.items.length !== 1 ? "s" : ""} · ${[...new Set(c.items.map((i) => i.category))].join(", ")}`,
    amount: c.total,
    currency: c.currency,
    step: step ? stepLabel(step.kind) : "",
    onBehalfOf: step && step.approverId !== viewerId ? ((await ctx.db.get(step.approverId))?.name ?? null) : null,
    createdAt: c.createdAt,
    reason: "",
    items: c.items,
    canPay: canPay && c.status === "pending",
    attachments: await Promise.all(
      c.receipts.map(async (r) => {
        const meta = await ctx.db.system.get(r.storageId);
        const type = meta?.contentType ?? "";
        return {
          name: r.name,
          url: await ctx.storage.getUrl(r.storageId),
          isImage: type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(r.name),
          isPdf: type.includes("pdf") || /\.pdf$/i.test(r.name),
        };
      }),
    ),
  };
}

/** Everything waiting on the viewer, plus (for the CEO) anything stuck with someone else. */
export const inbox = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const isCeo = viewer.accessRole === "ceo";

    const leave = isCeo
      ? await ctx.db.query("leaveRequests").withIndex("by_status", (q) => q.eq("status", "pending")).collect()
      : await ctx.db.query("leaveRequests").withIndex("by_current_approver", (q) => q.eq("currentApproverId", viewer._id)).collect();
    const expenses = isCeo
      ? await ctx.db.query("expenseClaims").withIndex("by_status", (q) => q.eq("status", "pending")).collect()
      : await ctx.db.query("expenseClaims").withIndex("by_current_approver", (q) => q.eq("currentApproverId", viewer._id)).collect();

    const items = [
      ...(await Promise.all(leave.map((r) => leaveItem(ctx, r, viewer._id)))),
      ...(await Promise.all(expenses.map((c) => expenseItem(ctx, c, viewer._id, can(viewer.accessRole, "finance.view"))))),
    ].sort((a, b) => a.createdAt - b.createdAt);

    // Recently decided by the viewer (small company: a scan of recent rows is fine).
    const decidedLeave = (await ctx.db.query("leaveRequests").order("desc").take(200)).filter((r) =>
      r.steps.some((s) => s.decidedBy === viewer._id),
    );
    const decidedClaims = (await ctx.db.query("expenseClaims").order("desc").take(200)).filter((c) =>
      c.steps.some((s) => s.decidedBy === viewer._id),
    );
    const recent = [
      ...(await Promise.all(decidedLeave.map(async (r) => ({ ...(await leaveItem(ctx, r, viewer._id)), outcome: myOutcome(r.steps, viewer._id) })))),
      ...(await Promise.all(decidedClaims.map(async (c) => ({ ...(await expenseItem(ctx, c, viewer._id)), outcome: myOutcome(c.steps, viewer._id) })))),
    ]
      .sort((a, b) => (b.outcome.at ?? 0) - (a.outcome.at ?? 0))
      .slice(0, 15);

    return {
      waiting: items.filter((i) => !i.onBehalfOf),
      others: items.filter((i) => i.onBehalfOf), // CEO only
      recent,
    };
  },
});

function myOutcome(steps: Step[], viewerId: Id<"employees">) {
  const mine = steps.filter((s) => s.decidedBy === viewerId);
  const declined = mine.find((s) => s.status === "declined");
  return { decision: declined ? "declined" : "approved", at: Math.max(...mine.map((s) => s.decidedAt ?? 0)) } as const;
}

/** Count for the sidebar badge. */
export const waitingCount = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return 0;
    const [l, e] = await Promise.all([
      ctx.db.query("leaveRequests").withIndex("by_current_approver", (q) => q.eq("currentApproverId", viewer._id)).collect(),
      ctx.db.query("expenseClaims").withIndex("by_current_approver", (q) => q.eq("currentApproverId", viewer._id)).collect(),
    ]);
    return l.length + e.length;
  },
});

// ── Deciding ───────────────────────────────────────────────────────────

export const decide = mutation({
  args: {
    kind: v.union(v.literal("leave"), v.literal("expense")),
    id: v.string(),
    decision: v.union(v.literal("approve"), v.literal("decline")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { kind, id, decision, note }) => {
    const viewer = await requireViewer(ctx);
    const cleanNote = note?.trim() || undefined;
    if (decision === "decline" && !cleanNote) throw new ConvexError("Add a short reason when declining.");

    if (kind === "leave") {
      const leaveId = ctx.db.normalizeId("leaveRequests", id);
      const r = leaveId && (await ctx.db.get(leaveId));
      if (!r || r.status !== "pending") throw new ConvexError("This request has already been decided or withdrawn.");
      const next = decideChain(r.steps, viewer, decision, cleanNote);
      await ctx.db.patch(r._id, { ...next, decidedAt: next.status === "pending" ? undefined : Date.now() });
      await afterDecision(ctx, {
        requesterId: r.employeeId,
        status: next.status,
        currentApproverId: next.currentApproverId,
        viewer,
        what: `leave request (${r.startDate}${r.endDate !== r.startDate ? ` → ${r.endDate}` : ""})`,
        href: "/dashboard/leave",
        approvalsHref: "/dashboard/approvals",
        note: cleanNote,
      });
    } else {
      const claimId = ctx.db.normalizeId("expenseClaims", id);
      if (!claimId) throw new ConvexError("This claim has already been decided or withdrawn.");
      await decideExpense(ctx, viewer, claimId, decision, cleanNote);
    }
  },
});

/**
 * Approves or declines an expense claim's current step. With `payingNow` (Approve & pay),
 * the "approved" and "ready to pay" notices are skipped: the payment notice follows at once.
 */
export async function decideExpense(
  ctx: MutationCtx,
  viewer: Doc<"employees">,
  claimId: Id<"expenseClaims">,
  decision: "approve" | "decline",
  note: string | undefined,
  { payingNow = false }: { payingNow?: boolean } = {},
) {
  const c = await ctx.db.get(claimId);
  if (!c || c.status !== "pending") throw new ConvexError("This claim has already been decided or withdrawn.");
  const next = decideChain(c.steps, viewer, decision, note);
  if (payingNow && next.status !== "approved") throw new ConvexError("This claim still needs another approval before it can be paid.");
  await ctx.db.patch(c._id, { ...next, decidedAt: next.status === "pending" ? undefined : Date.now() });
  if (payingNow) return c;
  await afterDecision(ctx, {
    requesterId: c.employeeId,
    status: next.status,
    currentApproverId: next.currentApproverId,
    viewer,
    what: `expense claim "${c.title}"`,
    href: "/dashboard/expenses",
    approvalsHref: "/dashboard/approvals",
    note,
  });
  if (next.status === "approved") {
    const ceo = await findCeo(ctx);
    if (ceo && ceo._id !== viewer._id) {
      await notify(ctx, ceo._id, {
        title: "Expense claim ready to pay",
        body: `"${c.title}" was approved and is waiting for payment.`,
        href: "/dashboard/expenses?tab=all",
        tone: "warning",
      });
    }
  }
  return c;
}

async function afterDecision(
  ctx: MutationCtx,
  a: {
    requesterId: Id<"employees">;
    status: "pending" | "approved" | "declined";
    currentApproverId?: Id<"employees">;
    viewer: Doc<"employees">;
    what: string;
    href: string;
    approvalsHref: string;
    note?: string;
  },
) {
  if (a.status === "pending" && a.currentApproverId) {
    const requester = await ctx.db.get(a.requesterId);
    await notify(ctx, a.currentApproverId, {
      title: "Waiting on your approval",
      body: `${requester?.name ?? "Someone"}'s ${a.what}, approved by ${a.viewer.name}.`,
      href: a.approvalsHref,
      tone: "warning",
    });
    await notify(ctx, a.requesterId, {
      title: "One approval down",
      body: `${a.viewer.name} approved your ${a.what}. It's now with the CEO.`,
      href: a.href,
    });
  } else if (a.status === "approved") {
    await notify(ctx, a.requesterId, { title: "Approved", body: `Your ${a.what} was approved by ${a.viewer.name}.`, href: a.href, tone: "success" });
  } else if (a.status === "declined") {
    await notify(ctx, a.requesterId, {
      title: "Declined",
      body: `${a.viewer.name} declined your ${a.what}${a.note ? `: "${a.note}"` : "."}`,
      href: a.href,
      tone: "danger",
    });
  }
}

/** Notifies the first approver of a newly submitted request. */
export async function notifyFirstApprover(
  ctx: MutationCtx,
  approverId: Id<"employees"> | undefined,
  requester: Doc<"employees">,
  what: string,
) {
  if (!approverId) return;
  await notify(ctx, approverId, {
    title: "New request to approve",
    body: `${requester.name} submitted ${what}.`,
    href: "/dashboard/approvals",
    tone: "warning",
  });
}

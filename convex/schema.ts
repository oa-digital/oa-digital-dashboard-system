import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { ACCESS_ROLES } from "./permissions";

export const currency = v.union(v.literal("GHS"), v.literal("USD"));

export const phase = v.union(
  v.literal("lead"),
  v.literal("proposal"),
  v.literal("await"),
  v.literal("meet"),
  v.literal("action"),
  v.literal("progress"),
  v.literal("done"),
  v.literal("hold"),
);

export const transactionType = v.union(
  v.literal("income"),
  v.literal("expense"),
  v.literal("transfer"),
  v.literal("payment_received"),
);

export const role = v.union(v.literal("management"), v.literal("sales"));

export const accessRole = v.union(...ACCESS_ROLES.map((r) => v.literal(r)));

/** One sign-off in an approval chain (leave and expense claims share this shape). */
export const approvalStep = v.object({
  approverId: v.id("employees"),
  kind: v.union(v.literal("line_manager"), v.literal("ceo")),
  status: v.union(v.literal("pending"), v.literal("approved"), v.literal("declined"), v.literal("skipped")),
  decidedAt: v.optional(v.number()),
  decidedBy: v.optional(v.id("employees")), // differs from approverId when the CEO decides on someone's behalf
  note: v.optional(v.string()),
});

export const projectStatus = v.union(
  v.literal("planned"),
  v.literal("active"),
  v.literal("on_hold"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const taskStatus = v.union(v.literal("todo"), v.literal("in_progress"), v.literal("in_review"), v.literal("done"));

export const taskPriority = v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("urgent"));

export const requestStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("withdrawn"),
);

export default defineSchema({
  departments: defineTable({
    name: v.string(),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  // Everyone in the company. `userId` links a Better Auth login once their invite is accepted.
  employees: defineTable({
    name: v.string(),
    email: v.string(), // login email (lowercase)
    phone: v.optional(v.string()),
    jobTitle: v.string(),
    departmentId: v.optional(v.id("departments")),
    lineManagerId: v.optional(v.id("employees")),
    accessRole,
    userId: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("disabled")),
    annualLeaveDays: v.optional(v.number()), // overrides the company default (15)
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"])
    .index("by_name", ["name"])
    .index("by_department", ["departmentId"]),

  // Single-use "set your password" links. Only a SHA-256 hash of the token is stored.
  invites: defineTable({
    employeeId: v.id("employees"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdBy: v.optional(v.id("employees")),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_employee", ["employeeId"]),

  leaveTypes: defineTable({
    name: v.string(),
    countsAgainstAllowance: v.boolean(), // true for Annual: deducted from the yearly allowance
    paid: v.boolean(),
    active: v.boolean(),
    order: v.number(),
  }).index("by_order", ["order"]),

  leaveRequests: defineTable({
    employeeId: v.id("employees"),
    leaveTypeId: v.id("leaveTypes"),
    startDate: v.string(), // YYYY-MM-DD
    endDate: v.string(),
    days: v.number(), // working days (Mon–Fri)
    reason: v.string(),
    status: requestStatus,
    steps: v.array(approvalStep),
    currentApproverId: v.optional(v.id("employees")),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_employee", ["employeeId"])
    .index("by_current_approver", ["currentApproverId"])
    .index("by_status", ["status"]),

  expenseClaims: defineTable({
    employeeId: v.id("employees"),
    title: v.string(),
    currency,
    items: v.array(
      v.object({ date: v.string(), category: v.string(), description: v.string(), amount: v.number() }),
    ),
    total: v.number(),
    receipts: v.array(v.object({ storageId: v.id("_storage"), name: v.string() })),
    status: requestStatus,
    steps: v.array(approvalStep),
    currentApproverId: v.optional(v.id("employees")),
    paidAt: v.optional(v.number()),
    paidBy: v.optional(v.id("employees")),
    paymentProof: v.optional(v.array(v.object({ storageId: v.id("_storage"), name: v.string() }))), // invoice, transfer slip…
    paymentReference: v.optional(v.string()),
    transactionId: v.optional(v.id("transactions")),
    createdAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_employee", ["employeeId"])
    .index("by_current_approver", ["currentApproverId"])
    .index("by_status", ["status"]),

  projects: defineTable({
    name: v.string(),
    key: v.string(), // short prefix for task numbers, e.g. "ASH" → ASH-12
    client: v.string(),
    description: v.string(),
    status: projectStatus,
    startDate: v.optional(v.string()), // YYYY-MM-DD
    dueDate: v.optional(v.string()),
    leadId: v.optional(v.id("employees")),
    dealId: v.optional(v.id("deals")),
    driveFolderId: v.optional(v.string()), // this project's folder in the company Google Drive
    taskCounter: v.number(),
    createdBy: v.id("employees"),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_lead", ["leadId"]),

  projectMembers: defineTable({
    projectId: v.id("projects"),
    employeeId: v.id("employees"),
    addedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_employee", ["employeeId"])
    .index("by_project_employee", ["projectId", "employeeId"]),

  tasks: defineTable({
    projectId: v.id("projects"),
    number: v.number(),
    title: v.string(),
    description: v.string(),
    status: taskStatus,
    priority: taskPriority,
    assigneeId: v.optional(v.id("employees")),
    startDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    order: v.number(), // position within its board column
    createdBy: v.id("employees"),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_assignee", ["assigneeId"]),

  taskComments: defineTable({
    taskId: v.id("tasks"),
    authorId: v.id("employees"),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_task", ["taskId"]),

  projectDocuments: defineTable({
    projectId: v.id("projects"),
    name: v.string(),
    // Either an uploaded file or an external link (e.g. a Google Doc).
    storageId: v.optional(v.id("_storage")),
    url: v.optional(v.string()),
    size: v.optional(v.number()),
    contentType: v.optional(v.string()),
    // A Google Doc/Sheet/Slides created from the app in the company Drive (`url` is its link).
    googleFileId: v.optional(v.string()),
    googleType: v.optional(v.union(v.literal("document"), v.literal("spreadsheet"), v.literal("presentation"))),
    // Uploaded files are also copied to the project's Drive folder.
    driveUrl: v.optional(v.string()),
    driveStatus: v.optional(v.union(v.literal("pending"), v.literal("synced"), v.literal("failed"))),
    uploadedBy: v.id("employees"),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  projectActivity: defineTable({
    projectId: v.id("projects"),
    actorId: v.id("employees"),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  // In-app notifications (the bell).
  notifications: defineTable({
    employeeId: v.id("employees"),
    title: v.string(),
    body: v.string(),
    href: v.string(),
    tone: v.union(v.literal("info"), v.literal("success"), v.literal("warning"), v.literal("danger")),
    readAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_employee", ["employeeId"]),

  // DEPRECATED: replaced by `employees`. Kept until production has migrated.
  profiles: defineTable({
    userId: v.string(),
    email: v.string(),
    name: v.string(),
    role,
    initials: v.string(),
  })
    .index("by_userId", ["userId"])
    .index("by_email", ["email"]),

  deals: defineTable({
    client: v.string(),
    title: v.string(),
    value: v.number(),
    currency,
    phase,
    assignee: v.string(), // display name, kept in sync with ownerId
    ownerId: v.optional(v.id("employees")),
    paid: v.number(), // paidOpening + linked payment transactions; kept in sync by deals.ts
    paidOpening: v.optional(v.number()), // collected before payments were tracked as transactions
    nextAction: v.string(),
    notes: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_updatedAt", ["updatedAt"]),

  transactions: defineTable({
    type: transactionType,
    description: v.string(),
    amount: v.number(),
    currency,
    person: v.optional(v.string()),
    category: v.string(),
    date: v.string(), // YYYY-MM-DD
    orderId: v.optional(v.string()),
    dealId: v.optional(v.id("deals")), // a client payment against this deal
  })
    .index("by_date", ["date"])
    .index("by_deal", ["dealId"]),

  contacts: defineTable({
    name: v.string(),
    company: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    tags: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_name", ["name"]),

  // Emails sent to a contact from the app (through Resend), with delivery status.
  contactEmails: defineTable({
    contactId: v.id("contacts"),
    to: v.string(),
    subject: v.string(),
    body: v.string(), // plain text as written
    sentBy: v.id("employees"),
    status: v.union(v.literal("sending"), v.literal("sent"), v.literal("failed")),
    error: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  }).index("by_contact", ["contactId"]),

  // The company Google Workspace account that meetings and Drive files are created under.
  // Only ever read server-side: the tokens never leave Convex.
  googleConnection: defineTable({
    email: v.string(),
    refreshToken: v.string(),
    accessToken: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    scopes: v.string(),
    rootFolderId: v.optional(v.string()), // "OA Digital Command Center" folder in Drive
    connectedBy: v.id("employees"),
    connectedAt: v.number(),
  }),

  // One-time `state` values for the Google sign-in round trip.
  googleOAuthStates: defineTable({
    state: v.string(),
    employeeId: v.id("employees"),
    returnTo: v.string(), // origin to send the browser back to
    expiresAt: v.number(),
  }).index("by_state", ["state"]),

  // Google Calendar events with a Meet link, scheduled from the app.
  meetings: defineTable({
    title: v.string(),
    description: v.string(),
    startAt: v.number(),
    endAt: v.number(),
    attendees: v.array(
      v.object({
        email: v.string(),
        name: v.optional(v.string()),
        employeeId: v.optional(v.id("employees")),
        contactId: v.optional(v.id("contacts")),
      }),
    ),
    projectId: v.optional(v.id("projects")),
    contactId: v.optional(v.id("contacts")),
    googleEventId: v.string(),
    meetLink: v.optional(v.string()),
    calendarLink: v.optional(v.string()),
    status: v.union(v.literal("scheduled"), v.literal("cancelled")),
    createdBy: v.id("employees"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_start", ["startAt"])
    .index("by_project", ["projectId"])
    .index("by_contact", ["contactId"]),

  // DEPRECATED: replaced by `employees`. Kept until production has migrated.
  teamMembers: defineTable({
    name: v.string(),
    role: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    avatar: v.optional(v.string()),
    activeDeals: v.number(),
    totalRevenue: v.number(),
  })
    .index("by_name", ["name"]),
});

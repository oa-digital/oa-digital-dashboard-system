import { ConvexError, v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, mutation, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { getViewer } from "./lib";
import { accessTo, logActivity, requireProject } from "./projects";
import { driveRootFolder, driveUpload, googleFetch } from "./google";

/*
 * Project files in the company Drive, under "OA Digital Command Center/<KEY> · <project name>":
 *  - Google Docs, Sheets and Slides created from the Documents tab ("anyone with the link can edit")
 *  - copies of uploaded files ("anyone with the link can view")
 * Links are only shown inside the app.
 */

const googleType = v.union(v.literal("document"), v.literal("spreadsheet"), v.literal("presentation"));
const MIME = {
  document: "application/vnd.google-apps.document",
  spreadsheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
} as const;
const LABEL = { document: "Google Doc", spreadsheet: "Google Sheet", presentation: "Google Slides" } as const;
const FILES = "https://www.googleapis.com/drive/v3/files";

export const projectForDrive = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) throw new ConvexError("Unauthenticated");
    const project = await ctx.db.get(projectId);
    if (!project) throw new ConvexError("That project no longer exists.");
    if (!(await accessTo(ctx, viewer, project)).canView) throw new ConvexError("You're not on this project.");
    return { viewerId: viewer._id, name: project.name, key: project.key, driveFolderId: project.driveFolderId ?? null };
  },
});

export const saveProjectFolder = internalMutation({
  args: { projectId: v.id("projects"), driveFolderId: v.string() },
  handler: async (ctx, { projectId, driveFolderId }) => {
    await ctx.db.patch(projectId, { driveFolderId });
  },
});

export const saveGoogleFile = internalMutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    url: v.string(),
    googleFileId: v.string(),
    googleType,
    uploadedBy: v.id("employees"),
  },
  handler: async (ctx, { googleType: type, ...doc }) => {
    await ctx.db.insert("projectDocuments", { ...doc, googleType: type, contentType: MIME[type], createdAt: Date.now() });
    await logActivity(ctx, doc.projectId, doc.uploadedBy, `created the ${LABEL[type]} "${doc.name}"`);
  },
});

/** The project's Drive folder, created on first use (or again if someone deleted it in Drive). */
async function projectFolder(ctx: ActionCtx, projectId: Id<"projects">, project: { key: string; name: string; driveFolderId: string | null }) {
  if (project.driveFolderId) {
    const f = await googleFetch<{ id?: string; trashed?: boolean }>(ctx, `${FILES}/${project.driveFolderId}?fields=id,trashed`).catch(() => null);
    if (f?.id && !f.trashed) return project.driveFolderId;
  }
  const root = await driveRootFolder(ctx);
  const folder = await googleFetch<{ id: string }>(ctx, `${FILES}?fields=id`, {
    method: "POST",
    body: JSON.stringify({ name: `${project.key} · ${project.name}`, mimeType: "application/vnd.google-apps.folder", parents: [root] }),
  });
  await ctx.runMutation(internal.drive.saveProjectFolder, { projectId, driveFolderId: folder.id });
  return folder.id;
}

/** Shares a Drive file with anyone who has the link. False if the Workspace blocks it. */
async function shareByLink(ctx: ActionCtx, fileId: string, role: "reader" | "writer") {
  try {
    await googleFetch(ctx, `${FILES}/${fileId}/permissions?sendNotificationEmail=false`, {
      method: "POST",
      body: JSON.stringify({ role, type: "anyone", allowFileDiscovery: false }),
    });
    return true;
  } catch (err) {
    console.warn("[drive] link sharing blocked", err);
    return false;
  }
}

/** Creates a blank Doc/Sheet/Slides in the project's Drive folder and adds it to Documents. */
export const createGoogleFile = action({
  args: { projectId: v.id("projects"), name: v.string(), type: googleType },
  handler: async (ctx, { projectId, name, type }): Promise<string> => {
    const project = await ctx.runQuery(internal.drive.projectForDrive, { projectId });
    const title = name.trim() || `Untitled ${LABEL[type]}`;
    if (title.length > 200) throw new ConvexError("Keep the name under 200 characters.");

    const folderId = await projectFolder(ctx, projectId, project);

    const file = await googleFetch<{ id: string; webViewLink: string }>(ctx, `${FILES}?fields=id,webViewLink`, {
      method: "POST",
      body: JSON.stringify({ name: title, mimeType: MIME[type], parents: [folderId] }),
    });

    // Anyone with the link can edit, so the team can open it without Google accounts on their work emails.
    const shared = await shareByLink(ctx, file.id, "writer");

    await ctx.runMutation(internal.drive.saveGoogleFile, {
      projectId,
      name: title,
      url: file.webViewLink,
      googleFileId: file.id,
      googleType: type,
      uploadedBy: project.viewerId,
    });
    return shared ? "" : "Created, but your Google Workspace blocks link sharing, so only the company account can open it.";
  },
});

// ── Copies of uploaded files ───────────────────────────────────────────

export const uploadForDrive = internalQuery({
  args: { documentId: v.id("projectDocuments") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc?.storageId) return null;
    const project = await ctx.db.get(doc.projectId);
    if (!project) return null;
    return {
      projectId: project._id,
      project: { key: project.key, name: project.name, driveFolderId: project.driveFolderId ?? null },
      storageId: doc.storageId,
      name: doc.name,
      contentType: doc.contentType ?? null,
      alreadyCopied: !!doc.googleFileId,
    };
  },
});

export const saveDriveCopy = internalMutation({
  args: {
    documentId: v.id("projectDocuments"),
    status: v.union(v.literal("synced"), v.literal("failed")),
    googleFileId: v.optional(v.string()),
    driveUrl: v.optional(v.string()),
  },
  handler: async (ctx, { documentId, status, googleFileId, driveUrl }) => {
    if (!(await ctx.db.get(documentId))) return; // removed meanwhile
    await ctx.db.patch(documentId, { driveStatus: status, ...(googleFileId ? { googleFileId, driveUrl } : {}) });
  },
});

/** Copies an uploaded project file into the project's Drive folder. Scheduled after each upload. */
export const copyUploadToDrive = internalAction({
  args: { documentId: v.id("projectDocuments") },
  handler: async (ctx, { documentId }) => {
    const info = await ctx.runQuery(internal.drive.uploadForDrive, { documentId });
    if (!info || info.alreadyCopied) return;
    try {
      const blob = await ctx.storage.get(info.storageId);
      if (!blob) throw new Error("The uploaded file is missing from storage.");
      const folderId = await projectFolder(ctx, info.projectId, info.project);
      const file = await driveUpload(
        ctx,
        { name: info.name, mimeType: info.contentType || blob.type || "application/octet-stream", parents: [folderId] },
        blob,
      );
      await shareByLink(ctx, file.id, "reader");
      await ctx.runMutation(internal.drive.saveDriveCopy, { documentId, status: "synced", googleFileId: file.id, driveUrl: file.webViewLink });
    } catch (err) {
      console.error("[drive] copying upload failed", documentId, err);
      await ctx.runMutation(internal.drive.saveDriveCopy, { documentId, status: "failed" });
    }
  },
});

/** Tries the Drive copy again (after a failure, or for files uploaded before Google was connected). */
export const retryDriveCopy = mutation({
  args: { documentId: v.id("projectDocuments") },
  handler: async (ctx, { documentId }) => {
    const doc = await ctx.db.get(documentId);
    if (!doc?.storageId) throw new ConvexError("Only uploaded files can be copied to Drive.");
    await requireProject(ctx, doc.projectId, "view");
    if (doc.googleFileId) return;
    if (!(await ctx.db.query("googleConnection").first())) {
      throw new ConvexError("Google isn't connected. Ask the CEO to connect the company Google account in Settings.");
    }
    await ctx.db.patch(documentId, { driveStatus: "pending" });
    await ctx.scheduler.runAfter(0, internal.drive.copyUploadToDrive, { documentId });
  },
});

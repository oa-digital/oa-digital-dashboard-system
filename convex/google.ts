import { ConvexError, v } from "convex/values";
import { action, httpAction, internalMutation, internalQuery, mutation, query, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getViewer, requirePermission } from "./lib";
import { can } from "./permissions";

/*
 * One company Google Workspace account (e.g. info@) is connected by the CEO in Settings.
 * Meetings (Calendar + Meet) and Drive files are created under it. Needs GOOGLE_CLIENT_ID
 * and GOOGLE_CLIENT_SECRET on the deployment, and this redirect URI on the OAuth client:
 *   <CONVEX_SITE_URL>/google/callback
 */

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events", // create events with Meet links, send invites
  "https://www.googleapis.com/auth/drive.file", // only files and folders this app creates
].join(" ");

const STATE_TTL = 10 * 60 * 1000;

function redirectUri() {
  return `${process.env.CONVEX_SITE_URL}/google/callback`;
}

function clientConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ConvexError("Google isn't set up on this deployment yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  return { clientId, clientSecret };
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Origins the browser may be sent back to after connecting (same list auth trusts). */
function allowedOrigins() {
  return [process.env.SITE_URL, ...(process.env.TRUSTED_ORIGINS ?? "").split(",")]
    .map((o) => o?.trim().replace(/\/+$/, ""))
    .filter((o): o is string => !!o);
}

// ── Status & connecting ────────────────────────────────────────────────

/** Whether Google is connected, and to which account. Never exposes tokens. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const c = await ctx.db.query("googleConnection").first();
    return {
      connected: !!c,
      email: c?.email ?? null,
      connectedAt: c?.connectedAt ?? null,
      configured: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
      canManage: can(viewer.accessRole, "people.setAccess"),
    };
  },
});

/** Starts the Google sign-in for the company account. Returns the URL to send the browser to. */
export const startConnect = mutation({
  args: { returnTo: v.string() },
  handler: async (ctx, { returnTo }) => {
    const viewer = await requirePermission(ctx, "people.setAccess");
    const { clientId } = clientConfig();
    const origin = returnTo.replace(/\/+$/, "");
    if (!allowedOrigins().includes(origin)) throw new ConvexError("This site isn't allowed to connect Google.");
    const state = randomState();
    await ctx.db.insert("googleOAuthStates", { state, employeeId: viewer._id, returnTo: origin, expiresAt: Date.now() + STATE_TTL });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent", // always return a refresh token
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },
});

export const consumeState = internalMutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db.query("googleOAuthStates").withIndex("by_state", (q) => q.eq("state", state)).unique();
    if (!row) return null;
    await ctx.db.delete(row._id);
    if (row.expiresAt < Date.now()) return null;
    const employee = await ctx.db.get(row.employeeId);
    if (!employee || employee.status !== "active" || !can(employee.accessRole, "people.setAccess")) return null;
    return { employeeId: row.employeeId, returnTo: row.returnTo };
  },
});

export const saveConnection = internalMutation({
  args: {
    email: v.string(),
    refreshToken: v.string(),
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(),
    scopes: v.string(),
    connectedBy: v.id("employees"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("googleConnection").first();
    // Reconnecting the same account keeps its Drive folder.
    const rootFolderId = existing && existing.email === args.email ? existing.rootFolderId : undefined;
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("googleConnection", { ...args, rootFolderId, connectedAt: Date.now() });
  },
});

/** Google redirects here after the CEO approves access. */
export const oauthCallback = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const pending = state ? await ctx.runMutation(internal.google.consumeState, { state }) : null;
  const back = (result: string) =>
    new Response(null, { status: 302, headers: { Location: `${pending?.returnTo ?? process.env.SITE_URL}/dashboard/settings?google=${result}` } });

  if (!pending) return back("expired");
  if (!code) return back(url.searchParams.get("error") === "access_denied" ? "denied" : "error");

  try {
    const { clientId, clientSecret } = clientConfig();
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
    });
    const token = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
    if (!res.ok || !token.access_token || !token.refresh_token) {
      console.error("[google] token exchange failed", res.status, token.error);
      return back("error");
    }
    if (!token.scope?.includes("calendar.events") || !token.scope.includes("drive.file")) return back("scopes");

    const who = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    const { email } = (await who.json()) as { email?: string };
    if (!email) return back("error");

    await ctx.runMutation(internal.google.saveConnection, {
      email: email.toLowerCase(),
      refreshToken: token.refresh_token,
      accessToken: token.access_token,
      accessTokenExpiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
      scopes: token.scope,
      connectedBy: pending.employeeId,
    });
    return back("connected");
  } catch (err) {
    console.error("[google] callback failed", err);
    return back("error");
  }
});

export const connectionRow = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query("googleConnection").first(),
});

export const removeConnection = internalMutation({
  args: {},
  handler: async (ctx) => {
    const c = await ctx.db.query("googleConnection").first();
    if (c) await ctx.db.delete(c._id);
  },
});

/** Disconnects the company Google account and revokes the app's access. */
export const disconnect = action({
  args: {},
  handler: async (ctx) => {
    const ok = await ctx.runQuery(internal.google.viewerCanManage, {});
    if (!ok) throw new ConvexError("Only the CEO can disconnect Google.");
    const c = await ctx.runQuery(internal.google.connectionRow, {});
    if (c) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(c.refreshToken)}`, { method: "POST" }).catch(() => undefined);
    }
    await ctx.runMutation(internal.google.removeConnection, {});
  },
});

export const viewerCanManage = internalQuery({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    return !!viewer && can(viewer.accessRole, "people.setAccess");
  },
});

// ── Calling Google ─────────────────────────────────────────────────────

export const saveAccessToken = internalMutation({
  args: { accessToken: v.string(), accessTokenExpiresAt: v.number() },
  handler: async (ctx, args) => {
    const c = await ctx.db.query("googleConnection").first();
    if (c) await ctx.db.patch(c._id, args);
  },
});

export const saveRootFolder = internalMutation({
  args: { rootFolderId: v.string() },
  handler: async (ctx, { rootFolderId }) => {
    const c = await ctx.db.query("googleConnection").first();
    if (c) await ctx.db.patch(c._id, { rootFolderId });
  },
});

const NOT_CONNECTED = "Google isn't connected. Ask the CEO to connect the company Google account in Settings.";

/** A valid access token for the company account, refreshed when close to expiry. */
async function accessToken(ctx: ActionCtx) {
  const c = await ctx.runQuery(internal.google.connectionRow, {});
  if (!c) throw new ConvexError(NOT_CONNECTED);
  if (c.accessToken && (c.accessTokenExpiresAt ?? 0) > Date.now() + 60_000) return c.accessToken;

  const { clientId, clientSecret } = clientConfig();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: c.refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  });
  const token = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !token.access_token) {
    if (token.error === "invalid_grant") {
      throw new ConvexError("The Google connection has expired or was revoked. Ask the CEO to reconnect Google in Settings.");
    }
    throw new ConvexError("Couldn't reach Google. Please try again.");
  }
  const expiresAt = Date.now() + (token.expires_in ?? 3600) * 1000;
  await ctx.runMutation(internal.google.saveAccessToken, { accessToken: token.access_token, accessTokenExpiresAt: expiresAt });
  return token.access_token;
}

/** Calls a Google API as the company account. Throws a readable error on failure. */
export async function googleFetch<T>(ctx: ActionCtx, url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken(ctx);
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } } & T;
  if (!res.ok) {
    console.error("[google]", init.method ?? "GET", url, res.status, JSON.stringify(body.error ?? {}));
    if (res.status === 401 || res.status === 403) {
      throw new ConvexError(`Google refused the request: ${body.error?.message ?? res.statusText}`);
    }
    throw new ConvexError(`Google error: ${body.error?.message ?? res.statusText}`);
  }
  return body;
}

/** Uploads bytes to Drive (resumable upload, fine for large files). Returns the new file. */
export async function driveUpload(ctx: ActionCtx, meta: { name: string; mimeType: string; parents: string[] }, body: Blob) {
  const token = await accessToken(ctx);
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": meta.mimeType,
      "X-Upload-Content-Length": String(body.size),
    },
    body: JSON.stringify(meta),
  });
  const session = start.headers.get("Location");
  if (!start.ok || !session) throw new ConvexError(`Google Drive refused the upload: ${start.status} ${await start.text().catch(() => "")}`.trim());
  const put = await fetch(session, { method: "PUT", headers: { "Content-Type": meta.mimeType }, body });
  if (!put.ok) throw new ConvexError(`Google Drive upload failed: ${put.status} ${await put.text().catch(() => "")}`.trim());
  return (await put.json()) as { id: string; webViewLink: string };
}

/** Status code only, for deletes where "already gone" is fine. */
export async function googleDelete(ctx: ActionCtx, url: string) {
  const token = await accessToken(ctx);
  const res = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new ConvexError(`Google error: ${res.status} ${await res.text().catch(() => "")}`.trim());
  }
}

/** The "OA Digital Command Center" folder in the company Drive, created on first use. */
export async function driveRootFolder(ctx: ActionCtx) {
  const c = await ctx.runQuery(internal.google.connectionRow, {});
  if (!c) throw new ConvexError(NOT_CONNECTED);
  if (c.rootFolderId) {
    const existing = await googleFetch<{ id?: string; trashed?: boolean }>(
      ctx,
      `https://www.googleapis.com/drive/v3/files/${c.rootFolderId}?fields=id,trashed`,
    ).catch(() => null);
    if (existing?.id && !existing.trashed) return c.rootFolderId;
  }
  const folder = await googleFetch<{ id: string }>(ctx, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    body: JSON.stringify({ name: "OA Digital Command Center", mimeType: "application/vnd.google-apps.folder" }),
  });
  await ctx.runMutation(internal.google.saveRootFolder, { rootFolderId: folder.id });
  return folder.id;
}

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Branded email shell: a dark header, a heading, a paragraph and one call-to-action button. */
function layout({ heading, intro, button, url, footnote }: { heading: string; intro: string; button: string; url: string; footnote: string }) {
  const safeUrl = escapeHtml(url);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#EDF0F6;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0E1525;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="background:#0B1F3B;background-image:linear-gradient(160deg,#13203A,#0B1222);padding:28px 32px;">
                <p style="margin:0;font-size:18px;font-weight:600;color:#F3F6FB;">OA Digital</p>
                <p style="margin:4px 0 0;font-size:12px;color:#9FB0C8;">Command Center</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 8px;font-size:20px;font-weight:600;">${escapeHtml(heading)}</p>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#475467;">${intro}</p>
                <a href="${safeUrl}" style="display:inline-block;background:#1551b5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:999px;">
                  ${escapeHtml(button)}
                </a>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#8A94A6;">
                  ${footnote}<br />
                  Button not working? Paste this link into your browser:<br />
                  <span style="color:#1551b5;word-break:break-all;">${safeUrl}</span>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Sends through Resend. Needs RESEND_API_KEY and AUTH_EMAIL_FROM on the deployment;
 * until they are set, the message (with its link) goes to the Convex logs instead.
 */
async function send(
  to: string,
  subject: string,
  html: string,
  text: string,
  opts: { fromName?: string; replyTo?: string } = {},
): Promise<"sent" | "not_configured"> {
  const apiKey = process.env.RESEND_API_KEY;
  const configured = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !configured) {
    console.warn(`[email] Not configured (RESEND_API_KEY / AUTH_EMAIL_FROM). To ${to}: ${subject}\n${text}`);
    return "not_configured";
  }
  // "OA Digital <no-reply@...>" becomes "Ama via OA Digital <no-reply@...>" when sent on someone's behalf.
  const address = configured.match(/<([^>]+)>/)?.[1] ?? configured;
  const from = opts.fromName ? `${opts.fromName.replace(/["<>]/g, "")} via OA Digital <${address}>` : configured;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}) }),
  });
  if (!res.ok) {
    // Throwing marks the action as failed in the Convex dashboard logs.
    throw new Error(`Resend rejected "${subject}" for ${to}: ${res.status} ${await res.text()}`);
  }
  return "sent";
}

/** A plain message from a person: their words, then a small signature. */
function messageLayout({ body, senderName, senderTitle }: { body: string; senderName: string; senderTitle: string }) {
  const paragraphs = escapeHtml(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:#1F2937;">${p.replace(/\n/g, "<br />")}</p>`)
    .join("");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0E1525;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 16px;">
      <tr>
        <td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
            <tr><td>${paragraphs}</td></tr>
            <tr>
              <td style="padding-top:10px;border-top:1px solid #E5E7EB;">
                <p style="margin:10px 0 0;font-size:13px;font-weight:600;color:#0E1525;">${escapeHtml(senderName)}</p>
                <p style="margin:2px 0 0;font-size:12px;color:#6B7280;">${escapeHtml(senderTitle)} &middot; OA Digital &amp; Smart Security Solutions</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Sends a message written in the Contacts page, then records whether it went out. */
export const sendContactEmail = internalAction({
  args: { messageId: v.id("contactEmails") },
  handler: async (ctx, { messageId }) => {
    const m = await ctx.runQuery(internal.contacts.messageForSending, { messageId });
    if (!m) return;
    try {
      const result = await send(
        m.to,
        m.subject,
        messageLayout({ body: m.body, senderName: m.senderName, senderTitle: m.senderTitle }),
        `${m.body}\n\n--\n${m.senderName}\n${m.senderTitle} - OA Digital & Smart Security Solutions`,
        { fromName: m.senderName, replyTo: m.senderEmail },
      );
      await ctx.runMutation(internal.contacts.markMessage, {
        messageId,
        status: result === "sent" ? "sent" : "failed",
        error: result === "sent" ? undefined : "Email sending isn't set up on this deployment.",
      });
    } catch (err) {
      await ctx.runMutation(internal.contacts.markMessage, {
        messageId,
        status: "failed",
        error: err instanceof Error ? err.message.slice(0, 300) : "Sending failed.",
      });
    }
  },
});

export const sendPasswordReset = internalAction({
  args: { to: v.string(), name: v.string(), url: v.string() },
  handler: async (_ctx, { to, name, url }) => {
    await send(
      to,
      "Reset your OA Digital password",
      layout({
        heading: "Reset your password",
        intro: `Hi ${escapeHtml(name)}, we received a request to reset the password for your OA Digital account. This link expires in 1 hour.`,
        button: "Choose a new password",
        url,
        footnote: "If you didn't ask for this, you can ignore this email; your password won't change.",
      }),
      `Hi ${name},\n\nReset your OA Digital password using this link (valid for 1 hour):\n${url}\n\nIf you didn't ask for this, ignore this email.`,
    );
  },
});

export const sendInvite = internalAction({
  args: { to: v.string(), name: v.string(), inviterName: v.string(), url: v.string() },
  handler: async (_ctx, { to, name, inviterName, url }) => {
    await send(
      to,
      "You're invited to the OA Digital Command Center",
      layout({
        heading: `Welcome aboard, ${name.split(" ")[0]}`,
        intro: `${escapeHtml(inviterName)} has set up your OA Digital account. Choose a password to sign in to the Command Center. This link works once and expires in 7 days.`,
        button: "Set your password",
        url,
        footnote: "Weren't expecting this? You can ignore this email.",
      }),
      `Hi ${name},\n\n${inviterName} has set up your OA Digital account. Set your password here (valid for 7 days, works once):\n${url}`,
    );
  },
});

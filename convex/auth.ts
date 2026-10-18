import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { hashPassword, verifyPassword } from "./password";

const siteUrl = process.env.SITE_URL!;
// Other origins allowed to sign in (e.g. a preview Worker), comma-separated.
const extraOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim().replace(/\/+$/, ""))
  .filter(Boolean);

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl, ...extraOrigins],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      // There is no public sign-up; accounts are created with `users:createUser`.
      disableSignUp: true,
      minPasswordLength: 8,
      // bcrypt, so the existing account password hashes stay valid.
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(password, hash),
      },
      resetPasswordTokenExpiresIn: 60 * 60,
      // Runs inside the auth HTTP action. Scheduling the email (rather than sending it
      // inline) keeps the response time the same whether or not the address exists.
      sendResetPassword: async ({ user, url }) => {
        if (!("scheduler" in ctx)) throw new Error("Password reset must be requested over HTTP");
        await ctx.scheduler.runAfter(0, internal.email.sendPasswordReset, {
          to: user.email,
          name: user.name,
          url,
        });
      },
    },
    session: {
      expiresIn: 60 * 60 * 8,
    },
    plugins: [convex({ authConfig })],
  });
};

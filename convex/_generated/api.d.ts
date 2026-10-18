/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as approvals from "../approvals.js";
import type * as auth from "../auth.js";
import type * as contacts from "../contacts.js";
import type * as dates from "../dates.js";
import type * as deals from "../deals.js";
import type * as drive from "../drive.js";
import type * as email from "../email.js";
import type * as expenses from "../expenses.js";
import type * as google from "../google.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as leave from "../leave.js";
import type * as lib from "../lib.js";
import type * as meetings from "../meetings.js";
import type * as migrations from "../migrations.js";
import type * as notifications from "../notifications.js";
import type * as password from "../password.js";
import type * as people from "../people.js";
import type * as permissions from "../permissions.js";
import type * as projects from "../projects.js";
import type * as tasks from "../tasks.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  approvals: typeof approvals;
  auth: typeof auth;
  contacts: typeof contacts;
  dates: typeof dates;
  deals: typeof deals;
  drive: typeof drive;
  email: typeof email;
  expenses: typeof expenses;
  google: typeof google;
  http: typeof http;
  invites: typeof invites;
  leave: typeof leave;
  lib: typeof lib;
  meetings: typeof meetings;
  migrations: typeof migrations;
  notifications: typeof notifications;
  password: typeof password;
  people: typeof people;
  permissions: typeof permissions;
  projects: typeof projects;
  tasks: typeof tasks;
  transactions: typeof transactions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};

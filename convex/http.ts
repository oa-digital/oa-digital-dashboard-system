import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { oauthCallback } from "./google";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

// Google redirects back here after the company account is connected (see google.ts).
http.route({ path: "/google/callback", method: "GET", handler: oauthCallback });

export default http;

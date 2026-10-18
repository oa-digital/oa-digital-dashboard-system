"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { GoogleLogoIcon } from "@phosphor-icons/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

/** Whether the company Google account is connected (undefined while loading). */
export function useGoogleConnected() {
  const status = useQuery(api.google.status);
  return status === undefined ? undefined : !!status?.connected;
}

/** Shown where Google features live until the CEO connects the company account. */
export function GoogleNotice({ what, className }: { what: string; className?: string }) {
  const status = useQuery(api.google.status);
  if (!status || status.connected) return null;
  return (
    <div className={cn("flex items-start gap-3 rounded-2xl bg-muted px-4 py-3 text-[12.5px] text-fg-2", className)}>
      <GoogleLogoIcon size={18} weight="bold" className="mt-0.5 shrink-0 text-brand" />
      <p>
        {what} needs the company Google account.{" "}
        {status.canManage ? (
          <Link href="/dashboard/settings#google" className="font-semibold text-brand hover:underline">
            Connect it in Settings
          </Link>
        ) : (
          "Ask the CEO to connect it in Settings."
        )}
      </p>
    </div>
  );
}

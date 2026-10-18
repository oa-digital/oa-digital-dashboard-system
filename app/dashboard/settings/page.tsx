"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Icon } from "@phosphor-icons/react";
import { CheckCircleIcon, DesktopIcon, GoogleLogoIcon, LockSimpleIcon, MoonIcon, SunIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { Alert, Field, Input } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { useRole } from "@/lib/role-context";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { authClient } from "@/lib/auth-client";
import { cn, errorMessage, formatDate } from "@/lib/utils";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: Icon }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: DesktopIcon },
];

export default function SettingsPage() {
  const { user } = useRole();
  const { preference, setPreference } = useTheme();
  if (!user) return null;

  const details: [string, string][] = [
    ["Email", user.email],
    ["Job title", user.jobTitle],
    ["Department", user.department ?? "Not set"],
    ["Line manager", user.lineManager?.name ?? "None"],
    ["Access", user.accessLabel],
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader eyebrow="Account" title="Settings" description="Your profile, password and preferences." />

      {/* Profile */}
      <Card flush className="overflow-hidden">
        <div className="h-24 md:h-28" style={{ background: "var(--ink-bg)" }} />
        <div className="px-5 pb-6 md:px-6">
          <Avatar name={user.name} size={80} className="-mt-10 ring-4 ring-[var(--card-solid)]" />
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <p className="font-display text-[20px] font-semibold text-fg">{user.name}</p>
            <span className="badge badge-info">{user.accessLabel}</span>
          </div>
          <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[12px] font-semibold text-fg-3">{label}</dt>
                <dd className="mt-0.5 truncate text-[13.5px] text-fg">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-[12px] text-fg-3">
            Your job title, department and line manager are managed by HR. Ask them if anything is wrong.
          </p>
        </div>
      </Card>

      <ChangePasswordCard />

      <GoogleCard />

      {/* Appearance */}
      <Card>
        <CardHeader title="Appearance" description="Choose how the dashboard looks on this device." />
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map(({ value, label, icon: IconCmp }) => {
            const selected = preference === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPreference(value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl p-4 text-[12.5px] font-semibold transition-all",
                  selected
                    ? "bg-solid text-fg shadow-[0_0_0_2px_var(--brand),0_8px_20px_-10px_rgba(29,95,209,0.5)]"
                    : "bg-muted text-fg-2 hover:text-fg",
                )}
              >
                <IconCmp size={24} weight={selected ? "duotone" : "regular"} className={selected ? "text-brand" : ""} />
                {label}
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDone(false);
    if (next !== confirm) return setError("New passwords do not match.");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    setBusy(true);
    setError("");
    const { error: err } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (err) {
      setError(err.code === "INVALID_PASSWORD" ? "Your current password is incorrect." : (err.message ?? "Couldn't change your password."));
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  }

  return (
    <Card>
      <CardHeader title="Password" description="Changing it signs you out on your other devices." />
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}
        {done && (
          <Alert tone="success" icon={CheckCircleIcon}>
            Password changed.
          </Alert>
        )}
        <Field label="Current password">
          <Input icon={LockSimpleIcon} type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password">
            <Input type="password" required autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </div>
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Changing…" : "Change password"}
        </button>
      </form>
    </Card>
  );
}

const GOOGLE_RESULT: Record<string, { tone: "success" | "danger"; text: string }> = {
  connected: { tone: "success", text: "Google connected. Meetings and Drive files will be created under this account." },
  denied: { tone: "danger", text: "Google access wasn't granted." },
  scopes: { tone: "danger", text: "Please tick every permission Google asks for (Calendar and Drive), then try again." },
  expired: { tone: "danger", text: "That sign-in took too long. Please try again." },
  error: { tone: "danger", text: "Couldn't connect Google. Please try again." },
};

/** CEO only: connect the company Google Workspace account used for Meet and Drive. */
function GoogleCard() {
  const status = useQuery(api.google.status);
  const startConnect = useMutation(api.google.startConnect);
  const disconnect = useAction(api.google.disconnect);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Google sends the browser back here with ?google=<result>.
  const [result, setResult] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("google"),
  );

  // Tidy the URL once the result has been read.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("google")) return;
    params.delete("google");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}#google`);
  }, []);

  if (!status?.canManage) return null;
  const message = result ? (GOOGLE_RESULT[result] ?? GOOGLE_RESULT.error) : null;

  async function connect() {
    setBusy(true);
    setError("");
    try {
      window.location.href = await startConnect({ returnTo: window.location.origin });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card id="google">
      <CardHeader
        title="Google Workspace"
        description="The company Google account that meetings (Calendar + Meet) and Drive documents are created under."
      />
      <div className="space-y-4">
        {message && (
          <Alert tone={message.tone} icon={message.tone === "success" ? CheckCircleIcon : WarningCircleIcon}>
            {message.text}
          </Alert>
        )}
        {error && <Alert icon={WarningCircleIcon}>{error}</Alert>}
        {!status.configured && (
          <Alert tone="info" icon={WarningCircleIcon}>
            Google isn&apos;t set up on this server yet: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET need adding to Convex.
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">
              <GoogleLogoIcon size={19} weight="bold" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-semibold text-fg">{status.connected ? status.email : "Not connected"}</p>
              <p className="text-[12px] text-fg-3">
                {status.connected && status.connectedAt ? `Connected ${formatDate(new Date(status.connectedAt).toISOString())}` : "Use a Workspace account such as info@oadigismartsecurity.com"}
              </p>
            </div>
          </div>
          {status.connected ? (
            <div className="flex gap-2">
              <button type="button" onClick={connect} disabled={busy || !status.configured} className="btn btn-secondary btn-sm">
                Reconnect
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await disconnect({});
                    setResult(null);
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="btn btn-danger btn-sm"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button type="button" onClick={connect} disabled={busy || !status.configured} className="btn btn-primary">
              {busy ? "Opening Google…" : "Connect Google"}
            </button>
          )}
        </div>
        <p className="text-[12px] text-fg-3">
          The app only sees calendar events and Drive files it creates itself. Disconnecting stops new meetings and documents; existing ones stay in Google.
        </p>
      </div>
    </Card>
  );
}

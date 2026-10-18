"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { SignOutIcon } from "@phosphor-icons/react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { TopHeader } from "@/components/dashboard/top-header";
import { NotificationSidebar } from "@/components/dashboard/notification-sidebar";
import { CommandPalette } from "@/components/dashboard/command-palette";
import { ConfirmDialog } from "@/components/ui/modal";
import { BrandMark } from "@/components/ui/brand-mark";
import { useRole } from "@/lib/role-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { hydrated, user, isAuthenticated, logout } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace("/login");
  }, [hydrated, isAuthenticated, router]);

  // ⌘K / Ctrl+K opens the command palette
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const closeNotif = useCallback(() => setNotifOpen(false), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const askSignOut = useCallback(() => setSignOutOpen(true), []);

  // Signed in, but no app profile links this account to a role.
  if (hydrated && isAuthenticated && !user) {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <div className="card max-w-sm p-8 text-center">
          <div className="flex justify-center">
            <BrandMark variant="full" size={64} />
          </div>
          <h1 className="mt-5 font-display text-[20px] font-semibold text-fg">Account not set up</h1>
          <p className="mt-2 text-[13.5px] text-fg-2">
            You&apos;re signed in, but no role has been assigned to this account yet. Ask an administrator to set it up.
          </p>
          <button
            type="button"
            className="btn btn-secondary mt-6"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <SignOutIcon size={16} />
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (!hydrated || !user) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4">
        <BrandMark variant="full" size={72} className="animate-pulse" />
        <p className="text-[13px] text-fg-3">Loading your workspace…</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh gap-3 p-2 md:p-3">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((c) => !c)}
        mobileOpen={mobileNavOpen}
        onMobileClose={closeMobileNav}
        onSignOut={askSignOut}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopHeader
          onOpenNav={() => setMobileNavOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onBellClick={() => setNotifOpen((o) => !o)}
          onSignOut={askSignOut}
          notifOpen={notifOpen}
        />
        <main className="min-h-0 flex-1 overflow-y-auto px-1 pb-8 pt-2 md:px-2">
          <div className="mx-auto w-full max-w-360">{children}</div>
        </main>
      </div>

      <NotificationSidebar open={notifOpen} onClose={closeNotif} />
      <CommandPalette open={searchOpen} onClose={closeSearch} onSignOut={askSignOut} />
      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        message="You'll be returned to the sign-in screen. Any unsaved changes will be lost."
        confirmLabel="Sign out"
        icon={SignOutIcon}
        onClose={() => setSignOutOpen(false)}
        onConfirm={async () => {
          setSignOutOpen(false);
          await logout();
          router.push("/login");
        }}
      />
    </div>
  );
}

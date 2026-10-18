"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarSimpleIcon, SignOutIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/ui/brand-mark";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRole } from "@/lib/role-context";
import { SETTINGS_ITEM, isActivePath, visibleSections, type NavItem } from "./nav";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onSignOut: () => void;
};

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onMobileClose, onSignOut }: SidebarProps) {
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    onMobileClose();
  }, [pathname, onMobileClose]);

  return (
    <>
      <aside
        className="card hidden h-full shrink-0 flex-col overflow-hidden !rounded-[26px] md:flex"
        style={{
          width: collapsed ? "5.25rem" : "16rem",
          background: "var(--sidebar-bg)",
          borderColor: "var(--sidebar-border)",
          transition: "width 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} onSignOut={onSignOut} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="animate-fade absolute inset-0 bg-[rgba(8,12,21,0.45)] backdrop-blur-sm" onClick={onMobileClose} />
          <aside className="animate-drawer absolute inset-y-2 left-2 flex w-[17rem] max-w-[85vw] flex-col overflow-hidden rounded-[26px] bg-solid shadow-pop">
            <SidebarContent collapsed={false} onClose={onMobileClose} onSignOut={onSignOut} />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarContent({
  collapsed,
  onToggleCollapsed,
  onClose,
  onSignOut,
}: {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onClose?: () => void;
  onSignOut: () => void;
}) {
  const { can } = useRole();
  const sections = visibleSections(can);
  return (
    <>
      {/* Brand */}
      <div className={cn("flex h-[4.5rem] shrink-0 items-center gap-3", collapsed ? "justify-center px-2" : "px-5")}>
        {collapsed ? (
          <button type="button" onClick={onToggleCollapsed} aria-label="Expand sidebar" title="Expand sidebar">
            <BrandMark size={24} />
          </button>
        ) : (
          <>
            <BrandMark size={22} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate font-display text-[16px] font-semibold text-fg">OA Digital</p>
              <p className="truncate text-[11px] text-fg-3">Command Center</p>
            </div>
            {onToggleCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapsed}
                className="icon-btn icon-btn-sm"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <SidebarSimpleIcon size={18} />
              </button>
            )}
            {onClose && (
              <button type="button" onClick={onClose} className="icon-btn icon-btn-sm" aria-label="Close navigation">
                <XIcon size={18} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Nav */}
      <nav className={cn("flex-1 space-y-6 overflow-y-auto pb-4 pt-2", collapsed ? "px-3" : "px-4")}>
        {sections.map((section) => (
          <div key={section.label}>
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-line" />
            ) : (
              <p className="mb-2 px-3 text-[11px] font-medium" style={{ color: "var(--sidebar-section)" }}>
                {section.label}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={cn("shrink-0 space-y-1 border-t border-line py-3", collapsed ? "px-3" : "px-4")}>
        <NavLink item={SETTINGS_ITEM} collapsed={collapsed} />
        <button
          type="button"
          onClick={onSignOut}
          className={cn("snav-item hover:!text-danger", collapsed && "is-collapsed")}
          title={collapsed ? "Sign out" : undefined}
        >
          <SignOutIcon size={20} className="snav-icon shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </>
  );
}

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  const approvals = useQuery(api.approvals.waitingCount, item.badge === "approvals" ? {} : "skip") ?? 0;
  const count = item.badge === "approvals" ? approvals : 0;
  return (
    <Link
      href={item.href}
      className={cn("snav-item", active && "active", collapsed && "is-collapsed")}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
    >
      <span className="relative shrink-0">
        <Icon size={20} weight={active ? "duotone" : "regular"} className="snav-icon" />
        {collapsed && count > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-peach" />}
      </span>
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && count > 0 && (
        <span className="tabular rounded-full bg-peach px-1.5 text-[10.5px] font-bold leading-[18px] text-white">{count}</span>
      )}
    </Link>
  );
}

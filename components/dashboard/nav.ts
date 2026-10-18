import type { Icon } from "@phosphor-icons/react";
import {
  AddressBookIcon,
  CalendarCheckIcon,
  CheckSquareOffsetIcon,
  FolderSimpleIcon,
  GearSixIcon,
  ReceiptIcon,
  KanbanIcon,
  SquaresFourIcon,
  UsersThreeIcon,
  VideoCameraIcon,
  WalletIcon,
} from "@phosphor-icons/react";
import type { Permission } from "@/convex/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  description: string;
  /** Hidden unless the viewer holds this permission. */
  permission?: Permission;
  /** Shows a live count next to the label. */
  badge?: "approvals";
};

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Main menu",
    items: [
      { href: "/dashboard",          label: "Overview", icon: SquaresFourIcon, description: "Your day at a glance" },
      { href: "/dashboard/team",     label: "People",   icon: UsersThreeIcon,  description: "Directory & departments" },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/dashboard/projects",  label: "Projects",  icon: FolderSimpleIcon,      description: "Delivery projects, tasks & docs" },
      { href: "/dashboard/meetings",  label: "Meetings",  icon: VideoCameraIcon,       description: "Google Meet calls & invites" },
      { href: "/dashboard/leave",     label: "Leave",     icon: CalendarCheckIcon,     description: "Request time off, see who's away" },
      { href: "/dashboard/expenses",  label: "Expenses",  icon: ReceiptIcon,           description: "Claim back work spending" },
      { href: "/dashboard/approvals", label: "Approvals", icon: CheckSquareOffsetIcon, description: "Requests waiting on you", badge: "approvals" },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/dashboard/pipeline", label: "Pipeline", icon: KanbanIcon,      description: "Deals by phase",          permission: "pipeline.view" },
      { href: "/dashboard/contacts", label: "Contacts", icon: AddressBookIcon, description: "Clients & prospects",     permission: "pipeline.view" },
      { href: "/dashboard/finance",  label: "Finance",  icon: WalletIcon,      description: "Balances & transactions", permission: "finance.view" },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/dashboard/settings",
  label: "Settings",
  icon: GearSixIcon,
  description: "Profile, password & preferences",
};

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_SECTIONS.flatMap((s) => s.items), SETTINGS_ITEM];

/** Sections with only the items the viewer may see; empty sections are dropped. */
export function visibleSections(can: (p: Permission) => boolean) {
  return NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !i.permission || can(i.permission)) })).filter(
    (s) => s.items.length > 0,
  );
}

export function isActivePath(pathname: string, href: string) {
  return href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

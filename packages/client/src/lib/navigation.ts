import {
  Home,
  FileText,
  PlusCircle,
  Users,
  UserCog,
  Megaphone,
  ScrollText,
  FileInput,
  type LucideIcon,
} from "lucide-react";
import { hasRolePermission, type RolePermission, type UserRole } from "@application/shared";

/**
 * The app's navigation, in one place.
 *
 * The sidebar and the command palette both render this list and both have to
 * apply the same permission filter — a volunteer must not find Audit Log by
 * typing "audit" any more than by looking for it in the sidebar. Two copies of
 * the list would drift, and the drift would be a permission leak rather than a
 * cosmetic difference, so there is one source and one filter.
 */
export interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
  permission?: RolePermission;
  /** Extra words to match on that the label does not contain. */
  keywords?: string;
}

export const MENU_ITEMS: NavItem[] = [
  { name: "Dashboard", path: "/dashboard", icon: Home, keywords: "home overview" },
  { name: "Rooms", path: "/rooms", icon: FileText, keywords: "events" },
  { name: "Create Room", path: "/rooms/create", icon: PlusCircle, keywords: "new event add" },
  { name: "Users", path: "/admin/users", icon: Users, permission: "manage_users", keywords: "team members people" },
  { name: "Event Assignments", path: "/admin/event-assignments", icon: UserCog, permission: "manage_users", keywords: "assign staff" },
  { name: "Broadcast", path: "/admin/broadcast", icon: Megaphone, permission: "manage_users", keywords: "announce message all" },
  { name: "Audit Log", path: "/admin/audit-log", icon: ScrollText, permission: "manage_users", keywords: "history activity trail" },
];

export const TOOLS_ITEMS: NavItem[] = [
  { name: "Forms", path: "/forms", icon: FileInput, keywords: "attendance form builder" },
  { name: "Reports", path: "/reports", icon: FileText, keywords: "export pdf download" },
];

export const navItemsForRole = (role: UserRole | undefined, items: NavItem[]): NavItem[] =>
  items.filter((item) => !item.permission || hasRolePermission(role ?? "volunteer", item.permission));

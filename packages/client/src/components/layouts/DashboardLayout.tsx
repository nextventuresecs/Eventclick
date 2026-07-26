import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { ROLE_LABELS, hasRolePermission } from "@application/shared";
import {
  LogOut,
  Home,
  PlusCircle,
  Users,
  UserCog,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Bell,
  CalendarDays,
  UserCircle,
  Settings2,
  HelpCircle,
  FileInput,
  FileText,
  Building2,
  Download,
  Shield,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const HelpDropdown = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-400 hover:text-gray-700 hover:bg-(--color-gray-100) transition-colors cursor-pointer"
        title="Help & more"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute left-full top-0 ml-1 w-52 bg-(--color-surface) border border-(--color-gray-200) rounded-xl shadow-xl py-1.5 z-50">
          {HELP_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="flex items-center gap-3 px-4 py-2 text-sm text-(--color-gray-600) hover:bg-(--color-gray-50) hover:text-(--color-gray-900) transition-colors"
            >
              <item.icon className="w-4 h-4" /> {item.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const MENU_ITEMS = [
  { name: "Dashboard", path: "/dashboard", icon: Home },
  { name: "Rooms", path: "/rooms", icon: FileText },
  { name: "Create Room", path: "/rooms/create", icon: PlusCircle },
  { name: "Users", path: "/admin/users", icon: Users, permission: "manage_users" },
  { name: "Event Assignments", path: "/admin/event-assignments", icon: UserCog, permission: "manage_users" },
];

const TOOLS_ITEMS = [
  { name: "Forms", path: "/forms", icon: FileInput },
  { name: "Reports", path: "/reports", icon: FileText },
];

const HELP_ITEMS = [
  { name: "Help Center", path: "/help", icon: HelpCircle },
  { name: "Download app", path: "/download", icon: Download },
  { name: "Terms of Service", path: "/terms", icon: Shield },
  { name: "Privacy Policy", path: "/privacy", icon: Shield },
  { name: "Feedback", path: "/feedback", icon: MessageSquare },
  { name: "Report a bug", path: "/report-bug", icon: AlertTriangle },
];

export const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const profileRef = useRef<HTMLDivElement>(null);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const canManageRooms = user ? hasRolePermission(user.role, "manage_rooms") : false;
  const canViewForms = user ? hasRolePermission(user.role, "create_attendance_form") || hasRolePermission(user.role, "take_attendance") : false;
  const canViewReports = user ? hasRolePermission(user.role, "view_reports") : false;
  const canManageUsers = user ? hasRolePermission(user.role, "manage_users") : false;

  const navItems = MENU_ITEMS.filter((item) => {
    if (!item.permission) return true;
    return hasRolePermission(user?.role ?? "volunteer", item.permission as "manage_rooms" | "manage_live_session" | "create_attendance_form" | "take_attendance" | "view_reports" | "view_live_session" | "share_live_link" | "manage_users");
  }) as typeof MENU_ITEMS;

  const toolsItems = [
    ...(canViewForms ? [TOOLS_ITEMS[0]] : []),
    ...(canViewReports ? [TOOLS_ITEMS[1]] : []),
  ] as typeof TOOLS_ITEMS;

  const initials = user?.fullName
    ?.split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  const isActive = (path: string) => {
    if (path === "/rooms") return location.pathname === "/rooms";
    return location.pathname === path || (path !== "/dashboard" && location.pathname.startsWith(path));
  };

  const pageTitle = (() => {
    const all = [...navItems, ...toolsItems];
    const found = all.find((item) => isActive(item.path));
    if (found && found.path !== "/dashboard") return found.name;
    if (location.pathname === "/rooms/create") return "Create Room";
    if (location.pathname.startsWith("/rooms/")) return "Room Details";
    if (location.pathname.startsWith("/admin/event-assignments")) return "Event Assignments";
    return "Dashboard";
  })();

  const formatDate = () => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="h-screen flex overflow-hidden bg-(--color-bg)">
      <aside
        className={`border-r border-(--color-gray-200) bg-(--color-surface) text-(--color-gray-900) hidden md:flex flex-col h-full relative transition-all duration-300 shrink-0 ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-(--color-gray-200) shrink-0">
          {!isCollapsed && (
            <div className="flex items-center gap-2.5">
              <img src="/only_icon.png" alt="Eventclick" className="h-8 w-8 object-contain" />
              <div className="font-display font-bold text-base leading-none tracking-tight">
                <span className="text-(--color-primary)">Event</span>
                <span className="text-secondary">Click</span>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className="mx-auto">
              <img src="/only_icon.png" alt="Eventclick" className="h-8 w-8 object-contain" />
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-(--color-gray-500) hover:text-(--color-gray-900) hover:bg-(--color-gray-100) transition-colors cursor-pointer"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scroll-smooth">
          <div className="space-y-1">
            {!isCollapsed && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-3 mb-2">Menu</p>
            )}
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={isCollapsed ? item.name : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-150 ease-out ${
                    isCollapsed ? "justify-center" : ""
                  } ${
                    active ? "nav-item-active" : "nav-item-inactive"
                  }`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!isCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </div>

          {toolsItems.length > 0 && (
            <div className="space-y-1">
              {!isCollapsed && (
                <div className="border-t border-(--color-gray-200) my-2" />
              )}
              {!isCollapsed && (
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-3 mb-2">Tools</p>
              )}
              {toolsItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    title={isCollapsed ? item.name : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-150 ease-out ${
                      isCollapsed ? "justify-center" : ""
                    } ${
                      active ? "nav-item-active" : "nav-item-inactive"
                    }`}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {!isCollapsed && <span>{item.name}</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        <div className="border-t border-(--color-gray-200) p-3 space-y-2 shrink-0 relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen((prev) => !prev)}
            className={`w-full text-left rounded-xl p-3 transition-all duration-150 cursor-pointer ${
              profileOpen ? "bg-(--color-gray-100)" : "hover:bg-(--color-gray-50)"
            }`}
          >
            {!isCollapsed ? (
              <div className="rounded-xl bg-ink text-white p-3 shadow-lg">
                <div className="flex items-center gap-3">
                  {user?.photoUrl ? (
                    <img src={user.photoUrl} alt={user.fullName} className="w-10 h-10 rounded-full object-cover border-2 border-white/20 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-sm border border-white/20 shrink-0">{initials}</div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-semibold truncate text-white">{user?.fullName || "User"}</p>
                    <p className="text-xs text-white/70 truncate font-medium">{user ? ROLE_LABELS[user.role] : "Unknown role"}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Building2 className="w-3 h-3 text-white/70 shrink-0" />
                      <p className="text-[10px] text-white/70 truncate">{user?.organizationName || "Organization"}</p>
                    </div>
                  </div>
                  <ChevronUp className="w-4 h-4 text-white/50 shrink-0" />
                </div>
              </div>
            ) : (
              <div className="flex justify-center">
                {user?.photoUrl ? (
                  <img src={user.photoUrl} alt={user.fullName} className="w-9 h-9 rounded-full object-cover border-2 border-(--color-primary)" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-(--color-primary) flex items-center justify-center text-white font-bold text-xs shadow-sm">{initials}</div>
                )}
              </div>
            )}
          </button>

          {profileOpen && (
            <div className={`absolute bottom-full mb-2 w-64 bg-(--color-surface) border border-(--color-gray-200) rounded-xl shadow-xl py-1.5 z-50 ${
              isCollapsed ? "left-full ml-2" : "left-3 right-3"
            }`}>
              <div className="px-4 py-2.5 border-b border-(--color-gray-100)">
                <p className="text-sm font-semibold text-(--color-gray-900) truncate">{user?.fullName || "User"}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email || ""}</p>
              </div>
              <div className="py-1">
                <Link to="/profile" className="flex items-center gap-3 px-4 py-2 text-sm text-(--color-gray-600) hover:bg-(--color-gray-50) hover:text-(--color-gray-900) transition-colors">
                  <UserCircle className="w-4 h-4" /> Profile
                </Link>
                <Link to="/settings" className="flex items-center gap-3 px-4 py-2 text-sm text-(--color-gray-600) hover:bg-(--color-gray-50) hover:text-(--color-gray-900) transition-colors">
                  <Settings2 className="w-4 h-4" /> Settings
                </Link>
              </div>
              <div className="border-t border-(--color-gray-100)">
                <div className="py-1 flex items-center justify-between pr-2">
                  <Link to="/help" className="flex items-center gap-3 px-4 py-2 text-sm text-(--color-gray-600) hover:bg-(--color-gray-50) hover:text-(--color-gray-900) transition-colors">
                    <HelpCircle className="w-4 h-4" /> Help
                  </Link>
                  <HelpDropdown />
                </div>
              </div>
              <div className="border-t border-(--color-gray-100)">
                <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2 text-sm text-(--color-error) hover:bg-status-cancelled-bg transition-colors">
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <header className="h-16 border-b border-(--color-gray-200) bg-(--color-surface) flex items-center justify-between px-4 md:px-8 shrink-0">
          <div className="min-w-0">
            <h1 className="text-base font-display font-semibold text-(--color-gray-900) leading-tight tracking-tight truncate">
              {pageTitle}
            </h1>
            <p className="text-xs text-gray-400 leading-none mt-0.5 truncate">{user?.organizationName || "Organization"}</p>
          </div>

          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-(--color-gray-500) font-medium">
              <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
              <span>{formatDate()}</span>
            </div>

            <div className="hidden md:block h-4 w-px bg-(--color-gray-200)" />

            <button className="relative h-9 w-9 flex items-center justify-center rounded-xl text-(--color-gray-500) hover:text-(--color-gray-900) hover:bg-(--color-gray-100) transition-all duration-150 cursor-pointer" aria-label="Notifications">
              <Bell className="w-4.5 h-4.5" />
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-secondary ring-2 ring-(--color-surface)" />
            </button>

            {canManageRooms && (
              <Link to="/rooms/create">
                <Button size="sm" className="gap-1.5">
                  <PlusCircle className="w-4 h-4" />
                  <span className="hidden md:inline">New Room</span>
                </Button>
              </Link>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 md:p-8">
            <Outlet />
          </div>
        </div>

        <div className="fixed bottom-4 left-4 right-4 h-14 bg-(--color-surface)/95 backdrop-blur-md border border-(--color-gray-200) rounded-2xl shadow-lg flex items-center justify-around px-1 md:hidden z-40">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center p-2 rounded-full transition-colors ${
                  active ? "nav-item-active" : "text-gray-400 hover:text-(--color-gray-900)"
                }`}
                title={item.name}
              >
                <item.icon className="w-5 h-5" />
              </Link>
            );
          })}
          {toolsItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center p-2 rounded-full transition-colors ${
                  active ? "nav-item-active" : "text-gray-400 hover:text-(--color-gray-900)"
                }`}
                title={item.name}
              >
                <item.icon className="w-5 h-5" />
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
};

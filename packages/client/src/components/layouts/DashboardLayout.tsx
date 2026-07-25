import { useState, useEffect } from "react";
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
  HelpCircle,
  Mail,
  UserCircle,
  Building2,
  Settings2,
  FileInput,
  FileText,
  ChevronDown,
  Download,
  FileDown,
  Shield,
  MessageSquare,
  BookOpen,
  Smartphone,
  FileQuestion,
  Scale,
  Send,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(isCollapsed));
  }, [isCollapsed]);

  const canManageRooms = user ? hasRolePermission(user.role, "manage_rooms") : false;
  const canViewForms = user ? hasRolePermission(user.role, "create_attendance_form") || hasRolePermission(user.role, "take_attendance") : false;
  const canViewReports = user ? hasRolePermission(user.role, "view_reports") : false;
  const canManageUsers = user ? hasRolePermission(user.role, "manage_users") : false;

  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: Home },
    ...(canManageRooms ? [{ name: "Create Room", path: "/rooms/create", icon: PlusCircle }] : []),
    ...(user?.role === "ngo_admin" || user?.role === "event_admin"
      ? [
          { name: "Users", path: "/admin/users", icon: Users, permission: "manage_users" },
          { name: "Event Assignments", path: "/admin/event-assignments", icon: UserCog, permission: "manage_users" },
        ]
      : []),
  ];

  const toolsItems = [
    ...(canViewForms ? [{ name: "Forms", path: "/forms", icon: FileInput }] : []),
    ...(canViewReports ? [{ name: "Reports", path: "/reports", icon: FileText }] : []),
  ];

  const helpItems = [
    { name: "Help Center", path: "/help", icon: HelpCircle },
    { name: "Download app", path: "/download", icon: Download },
    { name: "Terms of Service", path: "/terms", icon: Scale },
    { name: "Privacy Policy", path: "/privacy", icon: Shield },
    { name: "Feedback", path: "/feedback", icon: MessageSquare },
    { name: "Report a bug", path: "/report-bug", icon: AlertTriangle },
  ];

  const initials = user?.fullName
    ?.split(" ")
    .map((n) => n.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2) || "?";

  const isActive = (path: string) => {
    return location.pathname === path || (path !== "/dashboard" && location.pathname.startsWith(path));
  };

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <aside
        className={`border-r border-[var(--color-gray-200)] bg-[var(--color-surface)] text-[var(--color-gray-900)] hidden md:flex flex-col relative transition-all duration-300 shrink-0 ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute top-7 -right-3 w-6 h-6 bg-[var(--color-surface)] border border-[var(--color-gray-200)] rounded-full flex items-center justify-center shadow-sm text-[var(--color-gray-500)] hover:text-[var(--color-gray-900)] hover:bg-[var(--color-gray-100)] cursor-pointer z-10"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>

        <div className={`p-6 flex items-center border-b border-[var(--color-gray-200)] ${isCollapsed ? "justify-center" : "justify-start gap-2"}`}>
          <div className="h-8 w-8 rounded-lg bg-[var(--gradient-brand)] flex items-center justify-center shrink-0 shadow-sm">
            <img
              src="/only_icon.png"
              alt="Eventclick Logo"
              className="h-5 w-5 object-contain"
            />
          </div>
          {!isCollapsed && (
            <div className="font-display font-extrabold text-lg leading-none tracking-tight">
              <span className="text-[var(--color-primary)]">Event</span>
              <span className="text-[var(--color-secondary)]">Click</span>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-gray-400)] px-3 mb-2">
              {isCollapsed ? "" : "Menu"}
            </p>
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={isCollapsed ? item.name : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isCollapsed ? "justify-center" : ""
                  } ${
                    active
                      ? "bg-[var(--gradient-brand)] text-white shadow-sm border-l-2 border-[var(--color-secondary)]"
                      : "text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-900)]"
                  }`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!isCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </div>

          <div className="border-t border-[var(--color-gray-200)]" />

          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-gray-400)] px-3 mb-2">
              {isCollapsed ? "" : "Tools"}
            </p>
            {toolsItems.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  title={isCollapsed ? item.name : undefined}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
                    isCollapsed ? "justify-center" : ""
                  } ${
                    active
                      ? "bg-[var(--gradient-brand)] text-white shadow-sm border-l-2 border-[var(--color-secondary)]"
                      : "text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-900)]"
                  }`}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {!isCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="mt-auto border-t border-[var(--color-gray-200)]">
          {!isCollapsed ? (
            <div className="p-4 space-y-3">
              <div className="rounded-xl bg-[var(--color-ink)] text-white p-3">
                <div className="flex items-center gap-3">
                  {user?.photoUrl ? (
                    <img
                      src={user.photoUrl}
                      alt={user.fullName}
                      className="w-10 h-10 rounded-full object-cover border-2 border-white/20 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-sm border border-white/20 shrink-0">
                      {initials}
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-semibold truncate text-white">
                      {user?.fullName || "User"}
                    </p>
                    <p className="text-xs text-white/70 truncate font-medium">
                      {user ? ROLE_LABELS[user.role] : "Unknown role"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Building2 className="w-3 h-3 text-white/70 shrink-0" />
                      <p className="text-[10px] text-white/70 truncate">
                        {user?.organizationName || "Organization"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-gray-400)] px-3 mb-2">
                  Account
                </p>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-900)] transition-colors text-left">
                  <UserCircle className="w-4 h-4 shrink-0" />
                  <span>Profile</span>
                </button>
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-900)] transition-colors text-left">
                  <Settings2 className="w-4 h-4 shrink-0" />
                  <span>Settings</span>
                </button>
                <div>
                  <button
                    onClick={() => setAccountOpen(!accountOpen)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-900)] transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <HelpCircle className="w-4 h-4 shrink-0" />
                      <span>Help</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${accountOpen ? "rotate-180" : ""}`} />
                  </button>
                  {accountOpen && (
                    <div className="ml-4 mt-1 space-y-0.5 border-l border-[var(--color-gray-200)] pl-3">
                      {helpItems.map((item) => (
                        <Link
                          key={item.path}
                          to={item.path}
                          className="flex items-center gap-3 px-3 py-1.5 rounded-md text-xs font-medium text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-900)] transition-colors"
                        >
                          <item.icon className="w-3.5 h-3.5 shrink-0" />
                          <span>{item.name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full justify-start border-[var(--color-gray-200)] text-[var(--color-gray-500)] hover:text-[var(--color-error)] hover:border-[var(--color-error)] hover:bg-[var(--color-status-cancelled-bg)]"
                onClick={logout}
              >
                <LogOut className="w-4 h-4 mr-2 shrink-0" />
                Sign out
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 p-4">
              {user?.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user.fullName}
                  className="w-9 h-9 rounded-full object-cover border-2 border-[var(--color-primary)]"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-xs shadow-sm">
                  {initials}
                </div>
              )}
              <div className="flex flex-col items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-9 h-9 text-[var(--color-gray-400)] hover:text-[var(--color-error)] hover:bg-[var(--color-status-cancelled-bg)]"
                  onClick={logout}
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-[var(--color-gray-200)] bg-[var(--color-surface)] flex items-center justify-between px-4 md:hidden shrink-0">
          <div className="flex items-center gap-2">
            <img
              src="/only_icon.png"
              alt="Eventclick Logo"
              className="h-8 w-8 object-contain"
            />
            <div className="font-display font-semibold text-base leading-none">
              <span className="text-[var(--color-primary)]">Event</span>
              <span className="text-[var(--color-secondary)]">Click</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <div className="flex items-center gap-2 mr-2">
                {user.photoUrl ? (
                  <img
                    src={user.photoUrl}
                    alt={user.fullName}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white text-xs font-bold">
                    {initials}
                  </div>
                )}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Sign out"
              className="text-[var(--color-gray-400)] hover:text-[var(--color-error)] hover:bg-[var(--color-status-cancelled-bg)]"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto pb-24 md:pb-0">
          <div className="max-w-7xl mx-auto p-4 md:p-8">
            <Outlet />
          </div>
        </div>

        <div className="fixed bottom-4 left-4 right-4 h-16 bg-[var(--color-surface)]/95 backdrop-blur-md border border-[var(--color-gray-200)] rounded-2xl shadow-lg flex items-center justify-around px-6 md:hidden z-40">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center p-2 rounded-full transition-colors ${
                  active
                    ? "text-[var(--color-primary)] bg-[var(--color-primary)]/10"
                    : "text-[var(--color-gray-400)] hover:text-[var(--color-gray-900)]"
                }`}
                title={item.name}
              >
                <item.icon className="w-6 h-6" />
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
};

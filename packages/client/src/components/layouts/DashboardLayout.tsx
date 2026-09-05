import { useState, useEffect, useRef } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { ROLE_LABELS, hasRolePermission } from "@application/shared";
import {
  LogOut,
  Home,
  PlusCircle,
  Users,
  UserCog,
  Megaphone,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
  ChevronDown,
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
  Sparkles,
  SlidersHorizontal,
  CheckCircle2,
  ExternalLink,
  Command,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { MENU_ITEMS, TOOLS_ITEMS, navItemsForRole } from "@/lib/navigation";
import { CommandPalette } from "@/components/CommandPalette";
import { ImageSource } from "@/components/MediaImage";
import { useNotifications } from "@/hooks/useNotifications";
import { useNetwork } from "@/hooks/useNetwork";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { Button } from "@/components/ui/button";

export const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const addonsRef = useRef<HTMLDivElement>(null);
  const headerMenuRef = useRef<HTMLDivElement>(null);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [addonsOpen, setAddonsOpen] = useState(false);
  // Separate from `profileOpen`, which belongs to the sidebar's own menu —
  // sharing it would open both at once.
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { notifications, unreadCount, markAllAsRead, markAsRead } = useNotifications();
  const { isOnline, isSyncing } = useNetwork();
  const { install, instructions, dismissInstructions } = usePwaInstall();

  const handleDownloadApp = () => {
    void install();
    setProfileOpen(false);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setHeaderMenuOpen(false);
  }, [location.pathname]);

  // Bound to the layout rather than the document at large, so it is inert on
  // the login and share pages. preventDefault matters: unhandled, Cmd/Ctrl+K
  // focuses the browser's address bar on some platforms.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (profileOpen && profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (addonsOpen && addonsRef.current && !addonsRef.current.contains(e.target as Node)) {
        setAddonsOpen(false);
      }
      if (
        headerMenuOpen &&
        headerMenuRef.current &&
        !headerMenuRef.current.contains(e.target as Node)
      ) {
        setHeaderMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen, notifOpen, addonsOpen, headerMenuOpen]);

  const canManageRooms = user ? hasRolePermission(user.role, "manage_rooms") : false;
  const canViewForms = user ? hasRolePermission(user.role, "create_attendance_form") || hasRolePermission(user.role, "take_attendance") : false;
  const canViewReports = user ? hasRolePermission(user.role, "view_reports") : false;
  const canManageUsers = user ? hasRolePermission(user.role, "manage_users") : false;

  // Same helper the command palette uses. Two copies of this filter would
  // drift, and the drift would be a permission leak rather than a cosmetic
  // difference.
  const navItems = navItemsForRole(user?.role, MENU_ITEMS);

  const toolsItems = [
    ...(canViewForms ? [TOOLS_ITEMS[0]!] : []),
    ...(canViewReports ? [TOOLS_ITEMS[1]!] : []),
  ];

  // A bottom tab bar holds at most 5 targets before they stop being tappable at
  // 375px. Four primary tabs plus Account; everything else moves into the drawer.
  const allNavItems = [...navItems, ...toolsItems];
  const primaryNavItems = allNavItems.slice(0, 4);
  const overflowNavItems = allNavItems.slice(4);

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
    if (location.pathname === "/profile") return "User Profile";
    if (location.pathname === "/help") return "Help Center & Documentation";
    if (location.pathname === "/feedback") return "Product Feedback";
    if (location.pathname === "/report-bug") return "Report a Bug";
    if (location.pathname === "/rooms/create") return "Create Room";
    if (location.pathname.startsWith("/rooms/")) return "Room Details";
    if (location.pathname.startsWith("/admin/event-assignments")) return "Event Assignments";
    if (location.pathname.startsWith("/admin/broadcast")) return "Broadcast";
    return "Dashboard";
  })();

  const formatDate = () => {
    const d = new Date();
    return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  };

  return (
    <div className="h-screen flex overflow-hidden bg-(--color-bg)">
      <aside
        className={`border-r border-(--color-gray-200) bg-(--color-surface) text-(--color-gray-900) hidden md:flex flex-col h-full relative transition-all duration-300 shrink-0 shadow-sm ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-(--color-gray-200)/80 shrink-0 relative">
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
            <div className="flex flex-col items-center gap-1" title="Eventclick">
              <div className="w-10 h-10 rounded-xl bg-brand-gradient text-white flex items-center justify-center font-display font-bold text-sm shadow-sm ring-1 ring-white/20 hover:shadow-md hover:ring-purple-400/40 transition-all duration-200 cursor-pointer">
                E
              </div>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 flex items-center justify-center rounded-lg text-(--color-gray-500) hover:text-(--color-gray-900) hover:bg-(--color-gray-100) transition-all duration-200 cursor-pointer hover:shadow-sm"
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
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-150 ease-out ${
                    isCollapsed ? "justify-center" : ""
                  } group
                    ${active
                      ? "bg-brand-gradient-tile text-white shadow-sm"
                      : "text-(--color-gray-600) hover:text-(--color-gray-900) hover:bg-(--color-gray-50)"}
                  `}
                >
                  {active && !isCollapsed && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-white/80" />
                  )}
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
                    className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all duration-150 ease-out ${
                      isCollapsed ? "justify-center" : ""
                    } group
                      ${active
                        ? "bg-brand-gradient-tile text-white shadow-sm"
                        : "text-(--color-gray-600) hover:text-(--color-gray-900) hover:bg-(--color-gray-50)"}
                    `}
                  >
                    {active && !isCollapsed && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-white/80" />
                    )}
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
            className={`w-full text-left rounded-xl transition-all duration-150 cursor-pointer ${
              profileOpen ? "ring-2 ring-purple-500/30" : "hover:opacity-95"
            }`}
          >
            {!isCollapsed ? (
              <div className="rounded-2xl bg-brand-gradient-tile text-white p-3.5 shadow-md border border-white/10 hover:shadow-lg transition-all">
                <div className="flex items-center gap-3">
                  {user?.photoUrl ? (
                    <ImageSource src={user.photoUrl} alt={user.fullName ?? ""} className="w-10 h-10 rounded-xl object-cover border-2 border-white/20 shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center text-white font-bold text-sm border border-white/20 shrink-0">{initials}</div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-bold truncate text-white font-display leading-tight">{user?.fullName || "User"}</p>
                    <p className="text-[11px] text-purple-200/90 truncate font-semibold">{user ? ROLE_LABELS[user.role] : "Member"}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3 text-purple-300 shrink-0" />
                      <p className="text-[10px] text-white/70 truncate">{user?.organizationName || "Organization"}</p>
                    </div>
                  </div>
                  <ChevronUp className={`w-4 h-4 text-white/70 shrink-0 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
                </div>
              </div>
            ) : (
              <div
                className="flex justify-center p-2 cursor-pointer"
                title={user?.fullName || "User"}
              >
                {user?.photoUrl ? (
                  <ImageSource src={user.photoUrl} alt={user.fullName ?? ""} className="w-9 h-9 rounded-xl object-cover border-2 border-purple-600 shadow-xs" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">{initials}</div>
                )}
              </div>
            )}
          </button>

          {profileOpen && (
            <div className={`absolute bottom-full mb-2 w-64 bg-white border border-gray-200 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-bottom-2 ${
              isCollapsed ? "left-full ml-2" : "left-3 right-3"
            }`}>
              <div className="px-4 py-2.5 border-b border-gray-100 bg-purple-50/50 rounded-t-2xl">
                <p className="text-sm font-bold font-display text-gray-900 truncate">{user?.fullName || "User"}</p>
                <p className="text-xs text-gray-400 font-mono truncate">{user?.email || ""}</p>
              </div>
              <div className="py-1">
                <Link
                  to="/profile"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                >
                  <UserCircle className="w-4 h-4 text-purple-600" /> Account Profile
                </Link>
                <Link
                  to="/help"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                >
                  <HelpCircle className="w-4 h-4 text-purple-600" /> Help Center
                </Link>
                <button
                  onClick={handleDownloadApp}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-purple-600" /> Download App
                </button>
                <Link
                  to="/feedback"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                >
                  <MessageSquare className="w-4 h-4 text-purple-600" /> Give Feedback
                </Link>
                <Link
                  to="/report-bug"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                >
                  <AlertTriangle className="w-4 h-4 text-red-500" /> Report a Bug
                </Link>
              </div>
              <div className="border-t border-gray-100 pt-1 mt-1">
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-semibold transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" /> Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        role={user?.role}
        onLogout={logout}
      />

      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
        {/* Network Status Banner */}
        {!isOnline && (
          <div className="absolute top-0 left-0 right-0 h-8 bg-red-500 text-white flex items-center justify-center text-xs font-semibold z-50 animate-in slide-in-from-top">
            <AlertTriangle className="w-3.5 h-3.5 mr-2" />
            You are offline. Changes will be saved locally and synced later.
          </div>
        )}
        {isOnline && isSyncing && (
          <div className="absolute top-0 left-0 right-0 h-8 bg-emerald-500 text-white flex items-center justify-center text-xs font-semibold z-50 animate-in slide-in-from-top">
            <Sparkles className="w-3.5 h-3.5 mr-2 animate-pulse" />
            Syncing offline data...
          </div>
        )}
        {/* Modern SaaS Header */}
        <header className={`min-h-16 pt-safe-inset border-b border-gray-200/80 bg-white/95 backdrop-blur-md flex items-center justify-between px-4 md:px-8 shrink-0 z-30 shadow-xs transition-all ${!isOnline || isSyncing ? "mt-8" : ""}`}>
          {/* Left Title & Breadcrumbs */}
          <div className="min-w-0 flex items-center gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-400">
                <span className="hover:text-purple-600 cursor-pointer transition-colors">Eventclick</span>
                <span>/</span>
                <span className="text-purple-700 font-medium truncate">{user?.organizationName || "Organization"}</span>
              </div>
              <h1 className="text-base md:text-lg font-extrabold font-display text-gray-900 leading-tight tracking-tight truncate flex items-center gap-2">
                {pageTitle}
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Sync
                </span>
              </h1>
            </div>
          </div>

          {/* Right Action Tools & Addons */}
          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            {/* Quick Addons / Options Icon Menu */}
            <div className="relative" ref={addonsRef}>
              <button
                onClick={() => setAddonsOpen(!addonsOpen)}
                className={`h-9 w-9 flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                  addonsOpen ? "bg-purple-100 text-purple-700 ring-2 ring-purple-400/30" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                }`}
                title="Quick SaaS Utilities & Actions"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              {addonsOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white border border-gray-200 shadow-xl py-2 text-xs z-50 animate-in fade-in zoom-in-95">
                  <div className="px-3.5 py-2 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-bold text-gray-900 font-display flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" /> Quick Addons
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">Shortcuts</span>
                  </div>

                  <div className="p-1 space-y-0.5">
                    {canManageRooms && (
                      <Link
                        to="/rooms/create"
                        onClick={() => setAddonsOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-semibold transition-colors"
                      >
                        <PlusCircle className="w-4 h-4 text-purple-600" /> Create Event Room
                      </Link>
                    )}
                    {canViewForms && (
                      <Link
                        to="/forms"
                        onClick={() => setAddonsOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-semibold transition-colors"
                      >
                        <FileInput className="w-4 h-4 text-purple-600" /> Attendance Forms
                      </Link>
                    )}
                    {canViewReports && (
                      <Link
                        to="/reports"
                        onClick={() => setAddonsOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-semibold transition-colors"
                      >
                        <FileText className="w-4 h-4 text-purple-600" /> Export PDF Reports
                      </Link>
                    )}
                    {canManageUsers && (
                      <Link
                        to="/admin/event-assignments"
                        onClick={() => setAddonsOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-semibold transition-colors"
                      >
                        <Users className="w-4 h-4 text-purple-600" /> Manage Team Assignments
                      </Link>
                    )}
                    <Link
                      to="/settings"
                      onClick={() => setAddonsOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-semibold transition-colors"
                    >
                      <Settings2 className="w-4 h-4 text-purple-600" /> Application Settings
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Notifications Bell Dropdown */}
            <div className="relative" ref={notifRef}>
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className={`relative h-9 w-9 flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                  notifOpen ? "bg-purple-100 text-purple-700 ring-2 ring-purple-400/30" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                }`}
                aria-label="Notifications"
              >
                <Bell className="w-4.5 h-4.5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-purple-600 ring-2 ring-white" />
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl bg-white border border-gray-200 shadow-xl py-2 text-xs z-50 animate-in fade-in zoom-in-95">
                  <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-bold text-gray-900 font-display">System Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllAsRead.mutate()}
                        className="text-[11px] font-semibold text-purple-600 hover:underline cursor-pointer"
                        disabled={markAllAsRead.isPending}
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>

                  <div className="p-2 space-y-1.5 max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-gray-500 text-xs">No notifications</div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`p-2.5 rounded-xl border space-y-1 transition-colors ${
                            !notif.isRead ? "bg-purple-50/60 border-purple-100" : "bg-gray-50 border-gray-100"
                          }`}
                          onClick={() => {
                            if (!notif.isRead) markAsRead.mutate(notif.id);
                          }}
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span className={`flex items-center gap-1.5 ${!notif.isRead ? "text-purple-900" : "text-gray-900"}`}>
                              {!notif.isRead && <span className="w-1.5 h-1.5 rounded-full bg-purple-600 shrink-0" />}
                              {notif.type === "attendance_checkin" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                              {notif.title}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono shrink-0">
                              {new Date(notif.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className={`text-[11px] ${!notif.isRead ? "text-gray-600" : "text-gray-500"}`}>{notif.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden md:block h-4 w-px bg-gray-200" />

            {/* Quick Action Primary Button */}
            {canManageRooms && (
              <Link to="/rooms/create" className="hidden sm:inline-flex">
                <Button size="sm" className="gap-1.5 bg-brand-gradient h-9 rounded-xl font-semibold shadow-xs">
                  <PlusCircle className="w-4 h-4" />
                  <span>New Room</span>
                </Button>
              </Link>
            )}

            {/* Command palette trigger. This pill previously existed as a
                styled <div> advertising ⌘K with nothing behind it; it is a
                button now because there is something behind it. */}
            <button
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              aria-keyshortcuts="Meta+K Control+K"
              className="hidden lg:flex items-center gap-2 px-3 h-9 rounded-xl bg-gray-100/80 border border-gray-200/80 text-gray-400 text-xs font-medium cursor-pointer hover:bg-gray-100 hover:text-gray-600 transition-all"
            >
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Quick search...</span>
              <kbd className="ml-2 px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-white rounded border border-gray-200 text-gray-500 shadow-2xs">
                ⌘K
              </kbd>
            </button>

            {/* Account menu — mobile reaches the same items via the bottom nav's
                Account tab. Deliberately the same list as the sidebar's profile
                menu: two account menus on one screen offering different things
                is worse than either on its own. */}
            <div className="relative hidden md:block" ref={headerMenuRef}>
              <button
                onClick={() => setHeaderMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={headerMenuOpen}
                aria-label="Account menu"
                className={`flex items-center gap-1 p-1 rounded-xl transition-colors cursor-pointer ${
                  headerMenuOpen ? "bg-gray-100 ring-2 ring-purple-400/30" : "hover:bg-gray-100"
                }`}
              >
                <ImageSource
                  src={user?.photoUrl}
                  alt=""
                  className="h-8 w-8 rounded-lg object-cover shadow-xs"
                  fallback={
                    <div className="h-8 w-8 rounded-lg bg-brand-gradient text-white flex items-center justify-center font-bold text-xs shadow-xs">
                      {initials}
                    </div>
                  }
                />
                <ChevronDown
                  className={`w-3.5 h-3.5 text-gray-400 transition-transform ${headerMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {headerMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95"
                >
                  <div className="px-4 py-2.5 border-b border-gray-100 bg-purple-50/50">
                    <p className="text-sm font-bold font-display text-gray-900 truncate">
                      {user?.fullName || "User"}
                    </p>
                    <p className="text-xs text-gray-400 font-mono truncate">{user?.email || ""}</p>
                    <p className="text-[11px] text-purple-600 font-semibold mt-0.5">
                      {user ? ROLE_LABELS[user.role] : "Member"}
                    </p>
                  </div>
                  <div className="py-1">
                    <Link
                      to="/profile"
                      role="menuitem"
                      onClick={() => setHeaderMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                    >
                      <UserCircle className="w-4 h-4 text-purple-600" /> Account Profile
                    </Link>
                    <Link
                      to="/settings"
                      role="menuitem"
                      onClick={() => setHeaderMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                    >
                      <Settings2 className="w-4 h-4 text-purple-600" /> Settings
                    </Link>
                    <Link
                      to="/help"
                      role="menuitem"
                      onClick={() => setHeaderMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                    >
                      <HelpCircle className="w-4 h-4 text-purple-600" /> Help Center
                    </Link>
                    <Link
                      to="/feedback"
                      role="menuitem"
                      onClick={() => setHeaderMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                    >
                      <MessageSquare className="w-4 h-4 text-purple-600" /> Give Feedback
                    </Link>
                    <Link
                      to="/report-bug"
                      role="menuitem"
                      onClick={() => setHeaderMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-500" /> Report a Bug
                    </Link>
                  </div>
                  <div className="border-t border-gray-100 pt-1 mt-1">
                    <button
                      role="menuitem"
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 font-semibold transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Install instructions sit in normal flow below the header — as an
            absolutely positioned bar they overlapped it whenever no offline or
            syncing banner was pushing the header down. */}
        {instructions && (
          <div
            role="status"
            className="shrink-0 px-4 py-3 bg-purple-600 text-white flex items-start gap-3 text-xs font-medium shadow-md animate-in slide-in-from-top"
          >
            <Download className="w-4 h-4 shrink-0 mt-px" />
            <p className="flex-1 min-w-0 leading-relaxed">{instructions}</p>
            <button
              onClick={dismissInstructions}
              className="shrink-0 h-5 w-5 flex items-center justify-center rounded hover:bg-white/20 transition-colors cursor-pointer"
              aria-label="Dismiss install instructions"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {/* pb-28 keeps content clear of the fixed mobile bottom nav */}
          <div className="max-w-7xl mx-auto p-4 pb-28 md:p-8 md:pb-8">
            <Outlet />
          </div>
        </div>

        {/* Mobile bottom nav. Labelled rather than icon-only, and each target is a
            full 56px-tall tap area so it clears the 44px touch-target minimum. */}
        <nav
          aria-label="Primary"
          className="fixed bottom-safe left-3 right-3 bg-(--color-surface)/95 backdrop-blur-md border border-(--color-gray-200) rounded-2xl shadow-lg flex items-stretch justify-around px-1 py-1 md:hidden z-40"
        >
          {primaryNavItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-current={active ? "page" : undefined}
                className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl transition-colors ${
                  active ? "nav-item-active" : "text-gray-400 active:bg-gray-100"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                <span className="text-[10px] font-semibold leading-none truncate max-w-full">
                  {item.name}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl transition-colors cursor-pointer ${
              overflowNavItems.some((item) => isActive(item.path))
                ? "nav-item-active"
                : "text-gray-400 active:bg-gray-100"
            }`}
            aria-label="Open account and more menu"
            aria-expanded={mobileMenuOpen}
          >
            {user?.photoUrl ? (
              <ImageSource src={user.photoUrl} alt="" className="w-5 h-5 rounded-full object-cover border border-purple-200 shrink-0" />
            ) : (
              <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center text-white font-bold text-[8px] shrink-0">{initials}</div>
            )}
            <span className="text-[10px] font-semibold leading-none">More</span>
          </button>
        </nav>

        {/* Mobile Account Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/40 animate-in fade-in"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="absolute right-0 top-0 h-full w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
              <div className="px-4 py-4 pt-safe border-b border-gray-100 bg-purple-50/60 flex items-start justify-between shrink-0">
                <div className="min-w-0">
                  <p className="text-sm font-bold font-display text-gray-900 truncate">{user?.fullName || "User"}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">{user?.email || ""}</p>
                  <p className="text-[11px] text-purple-600 font-semibold mt-0.5">{user ? ROLE_LABELS[user.role] : "Member"}</p>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-white transition-colors cursor-pointer"
                  aria-label="Close menu"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {/* Nav items that didn't fit in the bottom tab bar */}
                {overflowNavItems.length > 0 && (
                  <div className="pb-2 mb-1 border-b border-gray-100">
                    <p className="px-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                      Navigate
                    </p>
                    {overflowNavItems.map((item) => {
                      const active = isActive(item.path);
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                            active
                              ? "text-purple-900 bg-purple-50"
                              : "text-gray-700 hover:bg-purple-50 hover:text-purple-900"
                          }`}
                        >
                          <item.icon className="w-4.5 h-4.5 text-purple-600" /> {item.name}
                        </Link>
                      );
                    })}
                  </div>
                )}
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                >
                  <UserCircle className="w-4.5 h-4.5 text-purple-600" /> Account Profile
                </Link>
                <Link
                  to="/help"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                >
                  <HelpCircle className="w-4.5 h-4.5 text-purple-600" /> Help Center
                </Link>
                <button
                  onClick={handleDownloadApp}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors cursor-pointer"
                >
                  <Download className="w-4.5 h-4.5 text-purple-600" /> Download App
                </button>
                <Link
                  to="/feedback"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                >
                  <MessageSquare className="w-4.5 h-4.5 text-purple-600" /> Give Feedback
                </Link>
                <Link
                  to="/report-bug"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-900 font-medium transition-colors"
                >
                  <AlertTriangle className="w-4.5 h-4.5 text-red-500" /> Report a Bug
                </Link>
              </div>
              <div className="border-t border-gray-100 p-2 pb-safe shrink-0">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  <LogOut className="w-4.5 h-4.5" /> Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Legal Footer */}
        <footer className="border-t border-gray-200 bg-gray-50 py-3 px-4 md:px-8">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-gray-500">
            <span>© {new Date().getFullYear()} Eventclick. All rights reserved.</span>
            <div className="flex items-center gap-3">
              <a href="https://eventclick.live/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">Privacy</a>
              <a href="https://eventclick.live/terms" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">Terms</a>
              <a href="https://eventclick.live/cookies" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">Cookies</a>
              <a href="https://eventclick.live/gdpr-dpa" target="_blank" rel="noopener noreferrer" className="hover:text-gray-900 transition-colors">GDPR DPA</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

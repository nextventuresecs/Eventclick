import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { ROLE_LABELS, hasRolePermission } from "@application/shared";
import { LogOut, Home, PlusCircle, Users, UserCog, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("sidebar_collapsed") === "true";
  });

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(isCollapsed));
  }, [isCollapsed]);

  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: Home },
    ...(user && hasRolePermission(user.role, "manage_rooms")
      ? [{ name: "Create Room", path: "/rooms/create", icon: PlusCircle }]
      : []),
    ...(user && user.role === "ngo_admin"
      ? [
          { name: "Users", path: "/admin/users", icon: Users },
          {
            name: "Event Assignments",
            path: "/admin/event-assignments",
            icon: UserCog,
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen bg-linear-to-br from-background via-muted/10 to-primary/5 dark:via-muted/5 dark:to-primary/10">
      {/* Sidebar */}
      <aside 
        className={`border-r border-slate-200/80 bg-white text-slate-900 hidden md:flex flex-col relative transition-all duration-300 shrink-0 ${
          isCollapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Toggle Collapse Button */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute top-7 -right-3 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer z-10"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Header */}
        <div className={`p-6 flex items-center ${isCollapsed ? "justify-center" : "justify-start"}`}>
          <img 
            src={isCollapsed ? "/only_icon.png" : "/logo.png"} 
            alt="Eventclick Logo" 
            className={`${isCollapsed ? "h-8 w-8" : "h-auto w-auto object-contain"}`}
          />
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 px-4 py-2 space-y-1">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/dashboard" &&
                location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                title={isCollapsed ? item.name : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors ${
                  isCollapsed ? "justify-center" : ""
                } ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!isCollapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Profile / Account Area */}
        <div className="p-4 border-t border-slate-100 mt-auto flex flex-col">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-4">
              <div 
                className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm"
                title={`${user?.fullName} (${user ? ROLE_LABELS[user.role] : ""})`}
              >
                {user?.fullName.charAt(0).toUpperCase() || "?"}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="w-9 h-9 text-slate-500 hover:text-destructive hover:bg-destructive/5 rounded-md"
                onClick={logout}
                title="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 px-3 py-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shadow-sm shrink-0">
                  {user?.fullName.charAt(0).toUpperCase() || "?"}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-sm font-semibold truncate text-slate-800">{user?.fullName}</p>
                  <p className="text-xs text-slate-500 truncate font-medium">
                    {user ? ROLE_LABELS[user.role] : "Unknown role"}
                  </p>
                  {user?.organizationName && (
                    <p className="text-[10px] text-slate-400 truncate mt-0.5 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-primary/40" />
                      {user.organizationName}
                    </p>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full justify-start border-slate-200 text-slate-600 hover:text-destructive hover:border-destructive hover:bg-destructive/5"
                onClick={logout}
              >
                <LogOut className="w-4 h-4 mr-2 shrink-0" />
                Sign out
              </Button>
            </>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header (Only Logo and Logout/Sign Out) */}
        <header className="h-14 border-b border-slate-100 bg-white flex items-center justify-between px-4 md:hidden shrink-0">
          <img 
            src="/logo.png" 
            alt="Eventclick Logo" 
            className="h-10 w-auto object-contain" 
          />
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={logout} 
            title="Sign out"
            className="text-slate-500 hover:text-destructive hover:bg-destructive/5"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </header>

        {/* Page Content (Adding bottom padding on mobile for floating nav) */}
        <div className="flex-1 overflow-auto pb-24 md:pb-0">
          <div className="max-w-7xl mx-auto p-4 md:p-8">
            <Outlet />
          </div>
        </div>

        {/* Mobile Floating Bottom Nav Dock */}
        <div className="fixed bottom-4 left-4 right-4 h-16 bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-full shadow-lg flex items-center justify-around px-6 md:hidden z-40">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              (item.path !== "/dashboard" &&
                location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center p-2 rounded-full transition-colors ${
                  isActive
                    ? "text-primary bg-primary/10"
                    : "text-slate-500 hover:text-slate-900"
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


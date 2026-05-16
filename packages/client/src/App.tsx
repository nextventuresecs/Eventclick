import { createBrowserRouter, RouterProvider, Navigate, Outlet } from "react-router-dom";
import { hasRolePermission, type RolePermission } from "@application/shared";
import { useAuth } from "./hooks/useAuth";

// Pages
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { DashboardLayout } from "./components/layouts/DashboardLayout";
import { Dashboard } from "./pages/Dashboard";
import { CreateRoom } from "./pages/CreateRoom";
import { RoomFormBuilder } from "./pages/RoomFormBuilder";
import { Attendance } from "./pages/Attendance";
import { AttendanceRecords } from "./pages/AttendanceRecords";
import { RoomLive } from "./pages/RoomLive";
import { RoomWatch } from "./pages/RoomWatch";
import { AdminUsers } from "./pages/AdminUsers";
import { EventAssignments } from "./pages/EventAssignments";

const ConnectionError = () => {
  const { retryAuth } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-4">Connection Lost</h2>
        <p className="text-muted-foreground mb-6">Unable to verify your session.</p>
        <button
          onClick={retryAuth}
          className="inline-block px-6 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
        >
          Retry
        </button>
      </div>
    </div>
  );
};

const ProtectedRoute = () => {
  const { status } = useAuth();
  
  if (status === "loading") {
    return <div className="p-8 text-center text-muted-foreground">Loading session...</div>;
  }

  if (status === "error") {
    return <ConnectionError />;
  }
  
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

const AccessDenied = ({ permission }: { permission: RolePermission }) => (
  <div className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center p-6">
    <div className="space-y-3 text-center">
      <h2 className="text-2xl font-semibold">Access limited</h2>
      <p className="text-sm text-muted-foreground">
        Your role does not allow this action yet ({permission.replaceAll("_", " ")}).
      </p>
      <a href="/dashboard" className="text-sm font-medium text-primary hover:underline">
        Return to dashboard
      </a>
    </div>
  </div>
);

const PermissionRoute = ({ permission }: { permission: RolePermission }) => {
  const { status, user } = useAuth();

  if (status === "loading") {
    return <div className="p-8 text-center text-muted-foreground">Loading session...</div>;
  }

  if (status === "error") {
    return <ConnectionError />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (!user || !hasRolePermission(user.role, permission)) {
    return <AccessDenied permission={permission} />;
  }

  return <Outlet />;
};

const RoleRoute = ({ role }: { role: string }) => {
  const { status, user } = useAuth();

  if (status === "loading") {
    return <div className="p-8 text-center text-muted-foreground">Loading session...</div>;
  }

  if (status === "error") {
    return <ConnectionError />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (!user || user.role !== role) {
    return <AccessDenied permission={"manage_users" as RolePermission} />;
  }

  return <Outlet />;
};

const AuthRoute = () => {
  const { status } = useAuth();
  
  if (status === "loading") {
    return <div className="p-8 text-center text-muted-foreground">Loading session...</div>;
  }

  if (status === "error") {
    return <ConnectionError />;
  }
  
  if (status === "authenticated") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: "watch/:token",
    element: <RoomWatch />,
  },
  {
    element: <AuthRoute />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: "dashboard", element: <Dashboard /> },
          {
            element: <PermissionRoute permission="manage_rooms" />,
            children: [{ path: "rooms/create", element: <CreateRoom /> }],
          },
          {
            element: <PermissionRoute permission="create_attendance_form" />,
            children: [{ path: "rooms/:id/form-builder", element: <RoomFormBuilder /> }],
          },
          {
            element: <PermissionRoute permission="take_attendance" />,
            children: [{ path: "rooms/:id/attendance", element: <Attendance /> }],
          },
          {
            element: <PermissionRoute permission="view_reports" />,
            children: [{ path: "rooms/:id/attendance/records", element: <AttendanceRecords /> }],
          },
          {
            element: <PermissionRoute permission="view_live_session" />,
            children: [{ path: "rooms/:id/live", element: <RoomLive /> }],
          },
          {
            element: <RoleRoute role="ngo_admin" />,
            children: [
              { path: "admin/users", element: <AdminUsers /> },
              { path: "admin/event-assignments", element: <EventAssignments /> },
            ],
          },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

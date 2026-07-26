import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { hasRolePermission, type RolePermission } from "@application/shared";
import { useAuth } from "./hooks/useAuth";

// Pages
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { ForgotPasswordPage } from "./pages/ForgotPassword";
import { ResetPasswordPage } from "./pages/ResetPassword";
import { VerifyEmailPage } from "./pages/VerifyEmail";
import { OnboardingPage } from "./pages/Onboarding";
import { DashboardLayout } from "./components/layouts/DashboardLayout";
import { Dashboard } from "./pages/Dashboard";
import { Rooms } from "./pages/Rooms";
import { CreateRoom } from "./pages/CreateRoom";
import { RoomFormBuilder } from "./pages/RoomFormBuilder";
import { Attendance } from "./pages/Attendance";
import { AttendanceRecords } from "./pages/AttendanceRecords";
import { RoomLive } from "./pages/RoomLive";
import { RoomWatch } from "./pages/RoomWatch";
import { AdminUsers } from "./pages/AdminUsers";
import { EventAssignments } from "./pages/EventAssignments";
import { Forms } from "./pages/Forms";
import { Reports } from "./pages/Reports";
import { Profile } from "./pages/Profile";
import { HelpCenter } from "./pages/HelpCenter";
import { Feedback } from "./pages/Feedback";
import { ReportBug } from "./pages/ReportBug";
import { Settings } from "./pages/Settings";

const ConnectionError = () => {
  const { retryAuth } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight font-display mb-4">Connection Lost</h2>
        <p className="text-muted-foreground mb-6">
          Unable to verify your session.
        </p>
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
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading session...
      </div>
    );
  }

  if (status === "error") {
    return <ConnectionError />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (
    user &&
    user.role === "volunteer" &&
    !user.organizationId &&
    localStorage.getItem("Eventclick_onboarding_completed_or_skipped") !==
      "true" &&
    location.pathname !== "/onboarding"
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
};

const AccessDenied = ({ permission }: { permission: RolePermission }) => (
  <div className="mx-auto flex min-h-[50vh] max-w-lg items-center justify-center p-6">
    <div className="space-y-3 text-center">
      <h2 className="text-2xl font-semibold tracking-tight font-display">Access limited</h2>
      <p className="text-sm text-muted-foreground">
        Your role does not allow this action yet (
        {permission.replaceAll("_", " ")}).
      </p>
      <a
        href="/dashboard"
        className="text-sm font-medium text-primary hover:underline"
      >
        Return to dashboard
      </a>
    </div>
  </div>
);

const PermissionRoute = ({
  permission,
}: {
  permission: RolePermission | RolePermission[];
}) => {
  const { status, user } = useAuth();

  if (status === "loading") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading session...
      </div>
    );
  }

  if (status === "error") {
    return <ConnectionError />;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  const permissions = Array.isArray(permission) ? permission : [permission];
  const hasPermission =
    user && permissions.some((p) => hasRolePermission(user.role, p));

  if (!user || !hasPermission) {
    return <AccessDenied permission={permissions[0]!} />;
  }

  return <Outlet />;
};

const RoleRoute = ({ role }: { role: string }) => {
  const { status, user } = useAuth();

  if (status === "loading") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading session...
      </div>
    );
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
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading session...
      </div>
    );
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
    path: "verify-email",
    element: <VerifyEmailPage />,
  },
  {
    element: <AuthRoute />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: "onboarding", element: <OnboardingPage /> },
      {
        element: <DashboardLayout />,
        children: [
          { path: "dashboard", element: <Dashboard /> },
          { path: "profile", element: <Profile /> },
          { path: "settings", element: <Settings /> },
          { path: "help", element: <HelpCenter /> },
          { path: "feedback", element: <Feedback /> },
          { path: "report-bug", element: <ReportBug /> },
          { path: "rooms", element: <Rooms /> },
          {
            element: <PermissionRoute permission="manage_rooms" />,
            children: [{ path: "rooms/create", element: <CreateRoom /> }],
          },
          {
            element: <PermissionRoute permission="create_attendance_form" />,
            children: [
              { path: "rooms/:id/form-builder", element: <RoomFormBuilder /> },
            ],
          },
          { path: "forms", element: <Forms /> },
          {
            element: <PermissionRoute permission="view_reports" />,
            children: [
              { path: "reports", element: <Reports /> },
            ],
          },
          {
            element: <PermissionRoute permission="take_attendance" />,
            children: [
              { path: "rooms/:id/attendance", element: <Attendance /> },
            ],
          },
          {
            element: (
              <PermissionRoute
                permission={["view_reports", "take_attendance"]}
              />
            ),
            children: [
              {
                path: "rooms/:id/attendance/records",
                element: <AttendanceRecords />,
              },
            ],
          },
          {
            element: <PermissionRoute permission="view_live_session" />,
            children: [{ path: "rooms/:id/live", element: <RoomLive /> }],
          },
          {
            element: <RoleRoute role="ngo_admin" />,
            children: [
              { path: "admin/users", element: <AdminUsers /> },
              {
                path: "admin/event-assignments",
                element: <EventAssignments />,
              },
            ],
          },
        ],
      },
    ],
  },
]);

import { ErrorBoundary } from "./components/ErrorBoundary";

export function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}

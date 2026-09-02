import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
  Outlet,
  useLocation,
  useRouteError,
} from "react-router-dom";
import { hasRolePermission, type RolePermission } from "@application/shared";
import { useAuth } from "./hooks/useAuth";

import React, { Suspense } from "react";

import { ErrorBoundary } from "./components/ErrorBoundary";
import { RouteErrorFallback } from "./components/RouteErrorFallback";
import { CookieBanner } from "./components/CookieBanner";

const lazyLoad = (importFunc: () => Promise<any>, exportName: string) => {
  const LazyComponent = React.lazy(() => importFunc().then((m) => ({ default: m[exportName] })));
  return function WrappedComponent(props: any) {
    return (
      <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Loading...</div>}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
};

const LoginPage = lazyLoad(() => import("./pages/Login"), "LoginPage");
const RegisterPage = lazyLoad(() => import("./pages/Register"), "RegisterPage");
const ForgotPasswordPage = lazyLoad(() => import("./pages/ForgotPassword"), "ForgotPasswordPage");
const ResetPasswordPage = lazyLoad(() => import("./pages/ResetPassword"), "ResetPasswordPage");
const VerifyEmailPage = lazyLoad(() => import("./pages/VerifyEmail"), "VerifyEmailPage");
const OnboardingPage = lazyLoad(() => import("./pages/Onboarding"), "OnboardingPage");
const DashboardLayout = lazyLoad(() => import("./components/layouts/DashboardLayout"), "DashboardLayout");
const Dashboard = lazyLoad(() => import("./pages/Dashboard"), "Dashboard");
const Rooms = lazyLoad(() => import("./pages/Rooms"), "Rooms");
const CreateRoom = lazyLoad(() => import("./pages/CreateRoom"), "CreateRoom");
const RoomFormBuilder = lazyLoad(() => import("./pages/RoomFormBuilder"), "RoomFormBuilder");
const Attendance = lazyLoad(() => import("./pages/Attendance"), "Attendance");
const AttendanceRecords = lazyLoad(() => import("./pages/AttendanceRecords"), "AttendanceRecords");
const RoomLive = lazyLoad(() => import("./pages/RoomLive"), "RoomLive");
const RoomWatch = lazyLoad(() => import("./pages/RoomWatch"), "RoomWatch");
const AdminUsers = lazyLoad(() => import("./pages/AdminUsers"), "AdminUsers");
const AdminBroadcast = lazyLoad(() => import("./pages/AdminBroadcast"), "AdminBroadcast");
const EventAssignments = lazyLoad(() => import("./pages/EventAssignments"), "EventAssignments");
const Forms = lazyLoad(() => import("./pages/Forms"), "Forms");
const Reports = lazyLoad(() => import("./pages/Reports"), "Reports");
const Profile = lazyLoad(() => import("./pages/Profile"), "Profile");
const HelpCenter = lazyLoad(() => import("./pages/HelpCenter"), "HelpCenter");
const Feedback = lazyLoad(() => import("./pages/Feedback"), "Feedback");
const ReportBug = lazyLoad(() => import("./pages/ReportBug"), "ReportBug");
const Settings = lazyLoad(() => import("./pages/Settings"), "Settings");

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
    !user.organizationId &&
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
    errorElement: <RouteErrorFallback />,
  },
  {
    path: "watch/:token",
    element: <RoomWatch />,
    errorElement: <RouteErrorFallback />,
  },
  {
    path: "verify-email",
    element: <VerifyEmailPage />,
    errorElement: <RouteErrorFallback />,
  },
  {
    element: <AuthRoute />,
    errorElement: <RouteErrorFallback />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteErrorFallback />,
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
            element: <RoleRoute role="admin" />,
            children: [
              { path: "admin/users", element: <AdminUsers /> },
              { path: "admin/broadcast", element: <AdminBroadcast /> },
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


export function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
      <CookieBanner/>
    </ErrorBoundary>
  );
}

import { createBrowserRouter, RouterProvider, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";

// Pages
import { LoginPage } from "./pages/Login";
import { RegisterPage } from "./pages/Register";
import { DashboardLayout } from "./components/layouts/DashboardLayout";
import { Dashboard } from "./pages/Dashboard";
import { CreateRoom } from "./pages/CreateRoom";
import { RoomFormBuilder } from "./pages/RoomFormBuilder";
import { Attendance } from "./pages/Attendance";
import { RoomLive } from "./pages/RoomLive";
import { RoomWatch } from "./pages/RoomWatch";
// import { RoomDetails } from "./pages/RoomDetails"; // Next steps

const ProtectedRoute = () => {
  const { status } = useAuth();
  
  if (status === "loading") {
    return <div className="p-8 text-center text-muted-foreground">Loading session...</div>;
  }
  
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

const AuthRoute = () => {
  const { status } = useAuth();
  
  if (status === "loading") {
    return <div className="p-8 text-center text-muted-foreground">Loading session...</div>;
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
          { path: "rooms/create", element: <CreateRoom /> },
          { path: "rooms/:id/form-builder", element: <RoomFormBuilder /> },
          { path: "rooms/:id/attendance", element: <Attendance /> },
          { path: "rooms/:id/live", element: <RoomLive /> },
          // { path: "rooms/:id", element: <RoomDetails /> },
        ],
      },
    ],
  },
  {
    path: "*",
    element: (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold">404</h1>
          <p className="mt-2 text-muted-foreground">Page not found</p>
          <a href="/" className="mt-4 inline-block text-primary hover:underline">
            Go home
          </a>
        </div>
      </div>
    ),
  },
]);

export const App = () => {
  return <RouterProvider router={router} />;
};

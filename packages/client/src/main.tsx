import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "./hooks/useAuth";
import { ToastProvider } from "./hooks/useToast";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./lib/log";
import "./index.css";

installGlobalErrorHandlers();

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const AppTree = (
  <ToastProvider>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ToastProvider>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      {GOOGLE_CLIENT_ID ? (
        <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
          {AppTree}
        </GoogleOAuthProvider>
      ) : (
        AppTree
      )}
    </ErrorBoundary>
  </StrictMode>,
);

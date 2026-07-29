import { useRouteError, type ErrorResponse } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

function isRouterError(err: unknown): err is ErrorResponse {
  return typeof err === "object" && err !== null && "status" in err;
}

export function RouteErrorFallback() {
  const error = useRouteError();

  let message = "An unexpected error occurred while loading this page.";
  let statusCode: number | undefined;

  if (isRouterError(error)) {
    statusCode = error.status;
    if (statusCode === 404) {
      message = "The page you are looking for does not exist.";
    } else if (statusCode === 401 || statusCode === 403) {
      message = "You do not have permission to view this page.";
    } else if (error.data instanceof Error) {
      message = error.data.message || message;
    }
  } else if (error instanceof Error) {
    message = error.message || message;
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4 bg-white p-8 rounded-2xl shadow-sm border border-gray-200">
        <div className="mx-auto w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-gray-900 font-display">
          {statusCode === 404 ? "Page not found" : "Something went wrong"}
        </h2>
        <p className="text-sm text-gray-500 leading-relaxed">
          {message}
        </p>
        <div className="flex gap-3 justify-center">
          <Button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 bg-brand-gradient"
          >
            <RefreshCw className="w-4 h-4" />
            Reload page
          </Button>
          <Button
            variant="outline"
            onClick={() => window.history.back()}
          >
            Go back
          </Button>
        </div>
      </div>
    </div>
  );
}

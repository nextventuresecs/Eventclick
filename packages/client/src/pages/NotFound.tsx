import { Link, useLocation } from "react-router-dom";
import { Compass, ArrowLeft, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Renders for any path the router does not recognise.
 *
 * Nested inside the dashboard layout on purpose, so a mistyped URL keeps the
 * sidebar and header and stays somewhere the user can navigate from. A
 * standalone page would strand them on a dead end with a single link back.
 *
 * Signed-out visitors never reach this: the protected route ahead of it sends
 * them to the login page, which also avoids confirming which paths exist to
 * someone who is not authenticated.
 */
export const NotFound = () => {
  const location = useLocation();

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 border border-purple-100">
          <Compass className="h-7 w-7" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-gray-400">
            404
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-gray-900">
            Page not found
          </h1>
          <p className="text-sm leading-relaxed text-gray-500">
            Nothing lives at{" "}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-700 break-all">
              {location.pathname}
            </code>
            . It may have been moved, or the link that brought you here may be
            out of date.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/dashboard">
            <Button className="gap-2 rounded-xl bg-brand-gradient font-semibold shadow-xs">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Go to dashboard
            </Button>
          </Link>
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="gap-2 rounded-xl"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go back
          </Button>
        </div>

        <p className="text-xs text-gray-400">
          Press <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-500">⌘K</kbd>{" "}
          to search for a page.
        </p>
      </div>
    </div>
  );
};

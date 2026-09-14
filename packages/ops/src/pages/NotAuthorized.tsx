import { ACCESS_LOGOUT_PATH } from "@/lib/links";

export function NotAuthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-lg border border-line bg-panel p-6 text-center">
        <h1 className="text-lg font-semibold">Not authorized</h1>
        <p className="mt-2 text-sm text-muted">
          This email signed in, but it is not an active Ops Console maintainer. Ask an existing maintainer to add
          you, then sign in again.
        </p>
        <a href={ACCESS_LOGOUT_PATH} className="mt-4 inline-block text-sm font-medium text-brand hover:underline">
          Sign out
        </a>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ACCESS_LOGOUT_PATH, externalLinks } from "@/lib/links";
import { SearchBox } from "@/components/SearchBox";

// Users are reached through search; these arrive in #149 and #150.
const PLANNED = ["Health", "Logs"];

export function Layout({ children, email }: { children: ReactNode; email?: string }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
          <span className="font-semibold tracking-tight text-brand">Ops Console</span>

          <nav aria-label="Console" className="flex flex-wrap items-center gap-1">
            <Link to="/" className="rounded px-2 py-1 text-sm font-medium hover:bg-ground">
              Home
            </Link>
            {PLANNED.map((label) => (
              <span
                key={label}
                aria-disabled="true"
                title="Not available yet"
                className="cursor-not-allowed rounded px-2 py-1 text-sm text-muted/60"
              >
                {label}
              </span>
            ))}
          </nav>

          <SearchBox />

          <nav aria-label="External tools" className="flex flex-wrap items-center gap-1 sm:ml-auto">
            {externalLinks().map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded px-2 py-1 text-sm text-muted hover:bg-ground hover:text-ink"
              >
                {link.label} ↗
              </a>
            ))}
          </nav>

          {email && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted">{email}</span>
              <a href={ACCESS_LOGOUT_PATH} className="font-medium text-brand hover:underline">
                Sign out
              </a>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CornerDownLeft, LogOut, Settings2, UserCircle, HelpCircle } from "lucide-react";
import type { UserRole } from "@application/shared";
import {
  MENU_ITEMS,
  TOOLS_ITEMS,
  navItemsForRole,
  type NavItem,
} from "@/lib/navigation";

/**
 * ⌘K palette over the app's navigation and account actions.
 *
 * Scope is deliberately navigation, not content. Searching rooms would mean
 * either a request on every open or a server-side search endpoint that does
 * not exist — `GET /rooms` is paginated at 50, so a client-side filter would
 * quietly search only the first page and look like a broken search rather than
 * an absent one. The Dashboard and Rooms pages already have their own room
 * search. Rooms belong here once there is an endpoint to back them.
 *
 * Permission filtering comes from `navItemsForRole`, the same helper the
 * sidebar uses. A volunteer typing "audit" must find nothing, and that
 * property is worth more than the palette itself.
 */

export interface PaletteCommand {
  id: string;
  name: string;
  icon: NavItem["icon"];
  keywords?: string;
  /** Section heading this appears under. */
  group: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  role: UserRole | undefined;
  onLogout: () => void;
}

const matches = (command: PaletteCommand, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${command.name} ${command.keywords ?? ""}`.toLowerCase().includes(q);
};

export const CommandPalette = ({ open, onClose, role, onLogout }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<PaletteCommand[]>(() => {
    const toCommand = (item: NavItem, group: string): PaletteCommand => ({
      id: item.path,
      name: item.name,
      icon: item.icon,
      keywords: item.keywords,
      group,
      run: () => navigate(item.path),
    });

    return [
      ...navItemsForRole(role, MENU_ITEMS).map((i) => toCommand(i, "Navigate")),
      ...navItemsForRole(role, TOOLS_ITEMS).map((i) => toCommand(i, "Tools")),
      {
        id: "/profile",
        name: "Account Profile",
        icon: UserCircle,
        keywords: "avatar photo password me",
        group: "Account",
        run: () => navigate("/profile"),
      },
      {
        id: "/settings",
        name: "Settings",
        icon: Settings2,
        keywords: "preferences notifications organization",
        group: "Account",
        run: () => navigate("/settings"),
      },
      {
        id: "/help",
        name: "Help Center",
        icon: HelpCircle,
        keywords: "support faq docs",
        group: "Account",
        run: () => navigate("/help"),
      },
      {
        id: "logout",
        name: "Logout",
        icon: LogOut,
        keywords: "sign out exit",
        group: "Account",
        run: onLogout,
      },
    ];
  }, [role, navigate, onLogout]);

  const results = useMemo(
    () => commands.filter((c) => matches(c, query)),
    [commands, query],
  );

  // Reset per open, so the palette never reopens showing the last search.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    }
  }, [open]);

  // A filtered list can be shorter than the current selection.
  useEffect(() => {
    setActiveIndex((i) => (i >= results.length ? 0 : i));
  }, [results.length]);

  const runCommand = useCallback(
    (command: PaletteCommand | undefined) => {
      if (!command) return;
      onClose();
      command.run();
    },
    [onClose],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runCommand(results[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Keep the highlighted row visible when arrowing past the fold.
  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    // Guarded: scrollIntoView is absent in jsdom and in some older embedded
    // webviews, and keyboard navigation must not depend on it.
    if (typeof active?.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-100 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 pt-[12vh] animate-in fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in zoom-in-95 slide-in-from-top-2"
      >
        <div className="flex items-center gap-2.5 border-b border-gray-100 px-4">
          <Search className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages and actions..."
            aria-label="Search pages and actions"
            aria-controls="command-palette-results"
            className="h-12 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-gray-500 sm:block">
            ESC
          </kbd>
        </div>

        <div
          id="command-palette-results"
          ref={listRef}
          role="listbox"
          className="max-h-80 overflow-y-auto p-1.5"
        >
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-gray-400">
              No matches for “{query}”
            </p>
          ) : (
            results.map((command, index) => {
              const showGroup = command.group !== lastGroup;
              lastGroup = command.group;
              const isActive = index === activeIndex;
              return (
                <div key={command.id}>
                  {showGroup && (
                    <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      {command.group}
                    </p>
                  )}
                  <button
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runCommand(command)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                      isActive ? "bg-purple-50 text-purple-900" : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <command.icon
                      className={`h-4 w-4 shrink-0 ${isActive ? "text-purple-600" : "text-gray-400"}`}
                      aria-hidden="true"
                    />
                    <span className="flex-1 font-medium">{command.name}</span>
                    {isActive && (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-purple-400" aria-hidden="true" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-4 py-2 text-[10px] text-gray-400">
          <span className="font-medium">
            {results.length} {results.length === 1 ? "result" : "results"}
          </span>
          <span className="hidden gap-3 sm:flex">
            <span>↑↓ navigate</span>
            <span>↵ select</span>
          </span>
        </div>
      </div>
    </div>
  );
};

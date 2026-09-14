import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/** Exact-match search. The term goes to the URL and the server; nothing is remembered locally. */
export function SearchBox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const term = q.trim();
    if (term) navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <form role="search" onSubmit={submit} className="flex w-full items-center gap-2 sm:w-auto">
      <label htmlFor="ops-search" className="sr-only">
        Search by full email, user or org ID, org slug, or request ID
      </label>
      <input
        id="ops-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={320}
        autoComplete="off"
        spellCheck={false}
        placeholder="Email, ID, org slug, request ID"
        className="w-full rounded border border-line bg-panel px-3 py-1.5 text-sm sm:w-72"
      />
      <button type="submit" className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white">
        Search
      </button>
    </form>
  );
}

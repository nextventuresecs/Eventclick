import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { OpsApiError, opsApi, type WhoAmI } from "@/lib/api";
import { ApiProvider, type OpsApi } from "@/lib/apiContext";
import { Layout } from "@/components/Layout";
import { Home } from "@/pages/Home";
import { NotAuthorized } from "@/pages/NotAuthorized";
import { SearchResults } from "@/pages/SearchResults";
import { UserDetailPage } from "@/pages/UserDetail";
import { OrgDetailPage } from "@/pages/OrgDetail";

type State =
  | { kind: "loading" }
  | { kind: "ready"; whoami: WhoAmI }
  | { kind: "forbidden" }
  | { kind: "error"; code: string };

export function App({ api = opsApi }: { api?: OpsApi }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    api
      .get<WhoAmI>("/whoami")
      .then((whoami) => {
        if (!cancelled) setState({ kind: "ready", whoami });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof OpsApiError && err.status === 403) setState({ kind: "forbidden" });
        else setState({ kind: "error", code: err instanceof OpsApiError ? err.code : "NETWORK_ERROR" });
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (state.kind === "forbidden") return <NotAuthorized />;

  const email = state.kind === "ready" ? state.whoami.maintainer.email : undefined;

  let home;
  if (state.kind === "ready") {
    home = <Home whoami={state.whoami} />;
  } else if (state.kind === "error") {
    home = (
      <p role="alert" className="rounded-lg border border-line bg-panel p-5 text-sm text-danger">
        Could not load the session ({state.code}). Try again shortly.
      </p>
    );
  } else {
    home = <p className="text-sm text-muted">Loading…</p>;
  }

  return (
    <ApiProvider api={api}>
      <BrowserRouter>
        <Layout email={email}>
          <Routes>
            <Route path="/" element={home} />
            <Route path="/search" element={<SearchResults />} />
            <Route path="/users/:id" element={<UserDetailPage />} />
            <Route path="/orgs/:id" element={<OrgDetailPage />} />
            <Route path="*" element={<p className="text-sm text-muted">Page not found.</p>} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ApiProvider>
  );
}

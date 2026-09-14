import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { OpsApiError, opsApi } from "./api";

export type OpsApi = Pick<typeof opsApi, "get" | "post">;

const ApiContext = createContext<OpsApi>(opsApi);

export function ApiProvider({ api, children }: { api: OpsApi; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export const useApi = () => useContext(ApiContext);

export type QueryState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; httpStatus: number; code: string };

/**
 * GET an ops-api path, refetching when it or `refreshKey` changes. Results live
 * in component state only: nothing is cached across navigation or written to
 * storage.
 */
export function useOpsQuery<T>(path: string | null, refreshKey = 0): QueryState<T> {
  const api = useApi();
  const key = path === null ? null : `${refreshKey}:${path}`;
  // Tagged with the request it answers, so a changed path or a refresh reads
  // as loading without a synchronous reset inside the effect.
  const [result, setResult] = useState<{ key: string; state: QueryState<T> } | null>(null);

  useEffect(() => {
    if (path === null || key === null) return;
    let cancelled = false;
    api
      .get<T>(path)
      .then((data) => {
        if (!cancelled) setResult({ key, state: { status: "ready", data } });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult({
          key,
          state:
            err instanceof OpsApiError
              ? { status: "error", httpStatus: err.status, code: err.code }
              : { status: "error", httpStatus: 0, code: "NETWORK_ERROR" },
        });
      });
    return () => {
      cancelled = true;
    };
  }, [api, path, key]);

  return result && result.key === key ? result.state : { status: "loading" };
}

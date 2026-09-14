export const OPS_API_PREFIX = "/ops-api/v1";

export class OpsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`${status} ${code}`);
    this.name = "OpsApiError";
  }
}

export interface OpsApiDeps {
  fetchImpl?: typeof fetch;
  reload?: () => void;
}

/**
 * The only way the Ops Console talks to ops-server.
 *
 * - 401, or a redirect (Cloudflare Access sends an expired session to its
 *   login page, which a same-origin fetch cannot follow): reload the page, so
 *   the top-level navigation goes through Access and comes back signed in.
 * - 403: the email passed Access but is not an active maintainer.
 * - 503 / 504: a panel-level error; the caller renders it.
 *
 * Responses are never written to browser storage.
 */
export function createOpsApi(deps: OpsApiDeps = {}) {
  const fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const reload = deps.reload ?? (() => window.location.reload());

  async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${OPS_API_PREFIX}${path}`, {
      method,
      credentials: "same-origin",
      redirect: "manual",
      headers:
        body === undefined
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (res.type === "opaqueredirect" || res.status === 401) {
      reload();
      throw new OpsApiError(401, "UNAUTHENTICATED");
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
      throw new OpsApiError(res.status, typeof body?.error === "string" ? body.error : "REQUEST_FAILED");
    }

    return (await res.json()) as T;
  }

  const get = <T>(path: string) => request<T>("GET", path);
  const post = <T>(path: string, body: unknown) => request<T>("POST", path, body);

  return { get, post };
}

export interface WhoAmI {
  maintainer: { id: string; email: string; displayName: string };
  release: string | null;
  serverTime: string;
}

export const opsApi = createOpsApi();

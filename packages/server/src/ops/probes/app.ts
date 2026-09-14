import type { OpsAppHealth } from "@application/shared";

/**
 * Reads the tenant server's deep health check over the compose network.
 * 503 is the server reporting a degraded dependency, so its body is data;
 * any other status, or a body without a checks map, is an unavailable probe.
 */
export async function probeApp(
  baseUrl: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<OpsAppHealth> {
  const res = await fetchImpl(`${baseUrl}/api/v1/health/deep`, {
    signal,
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  if (res.status !== 200 && res.status !== 503) {
    throw new Error(`unexpected status ${res.status}`);
  }

  const body = (await res.json()) as { checks?: unknown };
  const checks = body?.checks;
  if (!checks || typeof checks !== "object" || Array.isArray(checks)) {
    throw new Error("health body has no checks");
  }

  return {
    httpStatus: res.status,
    checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, typeof v === "string" ? v : String(v)])),
  };
}

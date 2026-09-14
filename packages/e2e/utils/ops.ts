/**
 * Ops Console e2e fixtures (#147).
 *
 * OPS_AUTH_BYPASS_EMAIL is process-wide, so the two identities run as two
 * ops-server instances: one as a seeded maintainer, one as an email that
 * Cloudflare Access would have let in but that is not in `maintainers`.
 */
export const E2E_MAINTAINER_EMAIL = "e2e-maintainer@nvces.test";
export const E2E_NON_MAINTAINER_EMAIL = "e2e-not-a-maintainer@nvces.test";

export const OPS_BASE_URL = process.env.PLAYWRIGHT_OPS_BASE_URL || "http://localhost:4100";
export const OPS_NON_MAINTAINER_BASE_URL =
  process.env.PLAYWRIGHT_OPS_NON_MAINTAINER_BASE_URL || "http://localhost:4101";

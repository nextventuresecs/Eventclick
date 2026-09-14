export interface ExternalLink {
  label: string;
  href: string;
}

const CLOUDWATCH_LOG_GROUP =
  "https://ap-south-1.console.aws.amazon.com/cloudwatch/home?region=ap-south-1#logsV2:log-groups/log-group/$252Feventclick$252Fprod$252Fcontainers";

/** Static deep links. Sentry is omitted when VITE_OPS_SENTRY_URL is not set at build time. */
export function externalLinks(sentryUrl: string | undefined = import.meta.env.VITE_OPS_SENTRY_URL): ExternalLink[] {
  return [
    ...(sentryUrl ? [{ label: "Sentry", href: sentryUrl }] : []),
    { label: "CloudWatch logs", href: CLOUDWATCH_LOG_GROUP },
    { label: "Cloudflare", href: "https://dash.cloudflare.com/" },
    { label: "GitHub Actions", href: "https://github.com/nextventuresecs/Eventclick/actions" },
  ];
}

/** Served by Cloudflare Access on this hostname; ends the Access session. */
export const ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";

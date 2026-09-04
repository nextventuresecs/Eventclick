import { env } from "../config/env";

/**
 * Shared branded shell for every outbound email.
 *
 * Written to the constraints of mail clients, not the browser:
 *
 * - Table layout, not flex or grid. Outlook renders through Word's HTML
 *   engine, which supports neither.
 * - Every style inline. Gmail strips `<style>` blocks on forwarded mail, and
 *   CSS custom properties (`var(--color-primary)`) never resolve anywhere —
 *   so the brand values are duplicated as literals below rather than imported
 *   from the client's index.css.
 * - A background colour on every cell that shows one. Dark-mode clients
 *   invert unpainted backgrounds and leave dark text on a dark ground.
 *
 * Callers are responsible for escaping anything user-supplied that they pass
 * in — `bodyHtml` and `intro` are inserted verbatim so they can carry markup.
 */

// Mirrors packages/client/src/index.css. Kept as literals: see above.
const BRAND = {
  primary: "#402291",
  primaryDark: "#370679",
  accent: "#8C6FCF",
  gradientEnd: "#3160B7",
  ink: "#1D2939",
  muted: "#667085",
  border: "#E2E5ED",
  canvas: "#F5F3FC",
  surface: "#FFFFFF",
} as const;

export interface BrandedEmailOptions {
  /** Shown as the <h1>. Also the natural subject line. */
  heading: string;
  /** Optional lead paragraph under the heading. May contain markup. */
  intro?: string;
  /** Main content. May contain markup. */
  bodyHtml?: string;
  /** Renders a single prominent call-to-action button. */
  cta?: { label: string; url: string };
  /** Small print under the body, above the footer. */
  footnote?: string;
}

const button = (label: string, url: string): string => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center" bgcolor="${BRAND.primary}" style="border-radius:12px;">
        <a href="${url}" style="display:inline-block;padding:13px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:12px;">${label}</a>
      </td>
    </tr>
  </table>`;

export const renderBrandedEmail = ({
  heading,
  intro,
  bodyHtml,
  cta,
  footnote,
}: BrandedEmailOptions): string => {
  const year = new Date().getFullYear();
  const font =
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.canvas};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${BRAND.canvas}" style="background-color:${BRAND.canvas};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;">

        <!-- Header -->
        <tr>
          <td align="left" bgcolor="${BRAND.primary}" style="background-color:${BRAND.primary};background-image:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.gradientEnd} 100%);padding:24px 32px;border-radius:16px 16px 0 0;">
            <span style="font-family:${font};font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:-0.3px;">Event<span style="color:${BRAND.accent};">Click</span></span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};padding:32px;border-left:1px solid ${BRAND.border};border-right:1px solid ${BRAND.border};">
            <h1 style="margin:0 0 12px 0;font-family:${font};font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.ink};">${heading}</h1>
            ${intro ? `<p style="margin:0 0 16px 0;font-family:${font};font-size:15px;line-height:1.6;color:${BRAND.ink};">${intro}</p>` : ""}
            ${bodyHtml ? `<div style="font-family:${font};font-size:15px;line-height:1.6;color:${BRAND.ink};">${bodyHtml}</div>` : ""}
            ${cta ? button(cta.label, cta.url) : ""}
            ${footnote ? `<p style="margin:20px 0 0 0;font-family:${font};font-size:13px;line-height:1.5;color:${BRAND.muted};">${footnote}</p>` : ""}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};padding:20px 32px 28px 32px;border:1px solid ${BRAND.border};border-top:0;border-radius:0 0 16px 16px;">
            <p style="margin:0;font-family:${font};font-size:12px;line-height:1.6;color:${BRAND.muted};">
              &copy; ${year} Eventclick &middot; <a href="${env.APP_URL}" style="color:${BRAND.primaryDark};text-decoration:none;">${env.APP_URL.replace(/^https?:\/\//, "")}</a>
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>
</body>
</html>`;
};

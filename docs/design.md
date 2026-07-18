# EventClick — Design System

## Brand Colors (extracted from logo)

| Token | Hex | Use |
|---|---|---|
| `--color-primary` | `#370679` | Deep indigo-purple — primary brand color, headers, "Event" wordmark |
| `--color-primary-dark` | `#2F166A` | Darkest gradient point — hover states, shadows |
| `--color-secondary` | `#3262B7` | Blue — "Click" wordmark, links, secondary actions |
| `--color-accent` | `#474EAC` | Blue-violet midpoint — icon accents, active states |
| `--color-tint` | `#8C7BC7` | Lighter violet — badges, subtle highlights, chips |
| `--color-ring` | `#E8E4F5` | Pale lavender — decorative rings, dividers, hover backgrounds |
| `--color-bg` | `#FDFDFE` | Near-white app background |
| `--color-surface` | `#FFFFFF` | Cards, modals, panels |

### Primary Gradient
```css
background: linear-gradient(135deg, #370679 0%, #474EAC 50%, #3262B7 100%);
```
Use for: primary CTA buttons, hero sections, active nav indicators, loading bars.

## Neutrals (for text/borders — not in logo, standard scale)
| Token | Hex |
|---|---|
| `--gray-900` (text) | `#1A1A2E` |
| `--gray-600` (secondary text) | `#5B5B70` |
| `--gray-300` (borders) | `#DADAE6` |
| `--gray-100` (subtle bg) | `#F4F4FA` |

## Semantic Colors (standard, kept distinct from brand palette)
| Token | Hex | Use |
|---|---|---|
| `--color-success` | `#22A06B` | Verified attendance, confirmed events |
| `--color-warning` | `#D9A404` | Pending verification |
| `--color-error` | `#D93838` | Failed verification, disputes |
| `--color-info` | `#3262B7` | (reuse secondary) informational states |

## Typography
- **Headings:** A geometric sans with confident weight (e.g. *Poppins* or *Sora*, 600–700) — echoes the bold, rounded letterforms in the wordmark.
- **Body:** A clean humanist sans (e.g. *Inter* or *Manrope*, 400–500) for readability in dashboards/tables.
- **Scale:** 12 / 14 / 16 / 20 / 24 / 32 / 40px.

## Iconography & Shape Language
- Rounded, slightly angular shapes (matching the logo's flag/wing motif) — avoid fully sharp corners.
- Concentric ring motif (from the logo) works well as a loading spinner, verification badge, or "live" pulse indicator.
- Border radius: 8px (inputs/buttons), 16px (cards), full-round (avatars/badges).

## Component Notes
- **Primary button:** gradient fill, white text, 8px radius, subtle shadow using `--color-primary-dark` at 20% opacity.
- **Verified badge:** `--color-success` fill with the ring motif as an outline, signaling "confirmed live event."
- **Nav/sidebar:** `--color-primary` background option for a premium feel, or white surface with `--color-accent` active-state indicator.

# Design System — EventClick

## Product Context
- **What this is:** EventClick is a SaaS platform for NGOs and FPOs to plan, run, and verify live events — attendance capture, live sessions, forms, and reports — all scoped to an organization with role-based access.
- **Who it's for:** NGO admins, event managers, and volunteers who need clean, trustworthy event operations tooling.
- **Space/industry:** Civic tech / event management SaaS
- **Project type:** Web app dashboard with role-aware navigation

## Aesthetic Direction
- **Direction:** Balanced/functional SaaS — closer to soft-lavender surfaces, rounded cards, and colored stat tiles. Decoration is intentional, not expressive — color and elevation carry hierarchy.
- **Decoration level:** Intentional — subtle surface treatments, no illustrations or gradient decoration except in brand lockup and primary CTAs.
- **Mood:** Professional, calm, organized. The product should feel like serious software for serious work — trustworthy, not flashy.
- **Reference sites:** SalesHub dashboard patterns, Linear-like clarity, Stripe-like restraint.

## Typography
- **Display / Brand wordmark:** Poppins, weight 600 — used for sidebar brand lockup, page titles, and stat card numbers.
- **Headings (H1-H4):** Poppins, weight 600 — used for page headers and section titles.
- **Body / UI / tables:** Inter, weight 400-500 — used for all body text, labels, table rows, and navigation.
- **Data / tables / numbers:** Geist or Inter with `font-variant-numeric: tabular-nums` — ensures aligned numbers in stat tiles and attendance counts.
- **Loading / CDN:** Google Fonts CDN for Poppins and Inter.
- **Scale:**
  - Hero/page title: 30px / 1.875rem (H2 in app)
  - Section header: 20px / 1.25rem (H3)
  - Card title: 16px / 1rem
  - Body: 14px / 0.875rem
  - Small / caption: 12px / 0.75rem
  - Stat number: 24px / 1.5rem

## Color
- **Approach:** Balanced — primary deep violet for authority, secondary royal blue for action, periwinkle for hover/interaction, ink navy for dark surfaces. Soft lavender tinted canvas, not white.
- **Palette:**
  - Deep violet: `#402291` — headings, "Event" wordmark half, primary active nav, primary stat tile
  - Royal blue: `#3160B7` — "Click" wordmark half, links, secondary accent, primary action buttons
  - Periwinkle: `#8C6FCF` — hover states, chart accent, tags, secondary interactions
  - Ink navy: `#28226E` — dark cards (profile card, sidebar footer), dark-mode base
  - Page background: `#F5F3FC` — app canvas, soft lavender tint
  - Surface / card: `#FFFFFF` — all cards, tables, modals
  - Neutral scale:
    - `#F8F9FC` — lightest tint, hover surfaces
    - `#F1F5F9` — light border, table header background
    - `#E2E5ED` — borders, dividers
    - `#CBD0DC` — medium borders
    - `#98A2B3` — muted text, placeholder
    - `#667085` — secondary text
    - `#475467` — body text (dark)
    - `#1D2939` — headings (dark)
    - `#0F172A` — highest contrast text
- **Semantic / Status colors** (reused everywhere — room cards, form cards, report cards):
  - Live: text `#166534` / background `#DCFCE7`
  - Scheduled / upcoming: text `#0C447C` / background `#E6F1FB`
  - Ended: text `#475467` / background `#F1F5F9`
  - Cancelled / flagged: text `#991B1B` / background `#FEE2E2`
- **Dark mode:** Not implemented. Light-only UI per current constraint.

## Spacing
- **Base unit:** 8px
- **Density:** Comfortable — not cramped, not wasteful.
- **Scale:**
  - 2xs: 2px
  - xs: 4px
  - sm: 8px
  - md: 16px
  - lg: 24px
  - xl: 32px
  - 2xl: 48px
  - 3xl: 64px

## Layout
- **Approach:** Grid-disciplined for dashboard and data views. Consistent max-width container with responsive padding.
- **Grid:**
  - Dashboard stat tiles: `auto-fit minmax(220px, 1fr)`
  - Dashboard content split: 60/40 (`lg:grid-cols-3` with right column `lg:col-span-1`)
  - Tables: full-width with horizontal scroll on small screens
- **Max content width:** 1280px (7xl) centered
- **Border radius:**
  - Cards / containers: 16px (`--radius-lg: 1rem`)
  - Buttons / inputs / pills: 8px (`--radius-btn: 0.5rem`)
  - Small elements / avatars: 4px
  - Full / avatars: 9999px
- **Shadow / elevation:** One soft tier only: `0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.1)`. No double shadows.

## Motion
- **Approach:** Minimal-functional — 150ms ease-out on hover/active only. No scroll-driven animation, no decorative motion.
- **Easing:** `ease-out` for hover/active states.
- **Duration:** Micro: 150ms.

## Component Tokens

### Sidebar (`DashboardLayout`)
- Width collapsed: 80px / expanded: 256px
- Border: `--color-gray-200` (right border)
- Background: `--color-surface`
- Active nav: filled `--color-primary` pill with white text and soft shadow
- Inactive nav: `--color-gray-500` text, hover `--color-gray-100` background
- Brand lockup:
  - Icon: `only_icon.png` (40px expanded, 32px collapsed)
  - "Event": `--color-primary`, Poppins 600, 20px, tracking-tight
  - "Click": `--color-secondary`, Poppins 600, 20px, tracking-tight
  - Wordmark baseline aligned left of icon in expanded state
- Dark card (sidebar bottom):
  - Background: `--color-ink`
  - Text: white with `white/70` subtitle
  - Radius: 12px, padding 12px
  - Contents: avatar/org icon, name, role subtitle, organization name
- Account section:
  - Items: Profile, Settings, Help (expandable), Sign out
  - Help submenu: Help Center, Download app, Terms of Service, Privacy Policy, Feedback, Report a bug
  - Expand/collapse with chevron rotation

### Page Header (every page)
- Left: `{Organization name} {Page label}` as title, subtitle line below (context-specific)
- Right (LTR order): notification bell, today's date ("Jul 25, 2026"), profile avatar with dropdown (Profile / Settings / Help / Sign out), primary action button (Create room, Add user, etc.)
- Primary action button: filled `--color-secondary`, white text, soft shadow — distinct from nav.

### Dashboard
- Page background: `--color-bg`
- Title: Poppins 600, 30px, `--color-gray-900`
- Subtitle: Inter 400, 14px, `--color-gray-400`
- Stat tiles: 4-up grid (`auto-fit minmax(220px, 1fr)`), card radius 16px, shadow-sm
  - Primary tile (Total Rooms): filled `--color-primary`, white text
  - Other tiles: `--color-surface` card with `--color-gray-200` border
  - Icons in `--color-primary` tinted container
  - Numbers: Poppins 600, 24px, `tabular-nums`
- Room status pills: colored per status table, no border, full background tint
- Room cards: `--color-surface`, `--color-gray-200` border, rounded-2xl, shadow-sm, hover shadow-md
- Members table: header `--color-gray-50`, dividers `--color-gray-100`, hover row `--color-gray-50`
- Mini calendar: card with event days dot-marked in `--color-secondary`
- Map card: placeholder with `--color-primary` pin icon, soft grid background

### Forms & Reports
- Cards: same radius/shadow as dashboard
- Filter pills: `--color-primary` when active, `--color-gray-200` border when inactive
- Status pills: reuse status color table

### Buttons
- Primary action: `--color-secondary` background, white text, shadow-sm, hover opacity-90
- Secondary / outline: `--color-gray-200` border, `--color-gray-600` text, hover `--color-gray-100` background
- Danger: `--color-status-cancelled-bg` background, `--color-status-cancelled` text, hover stronger tint
- Sizes: sm `h-8 px-3 text-xs`, default `h-10 px-4 text-sm`, large `h-11 px-6 text-base`

### Inputs
- Border: `--color-gray-200`
- Background: `--color-gray-50`
- Focus ring: `--color-primary`
- Radius: 8px
- Date inputs: Calendar icon overlay + `pl-10` padding

## Gradients & Borders
- **Brand gradient:** `linear-gradient(135deg, #402291 0%, #3160B7 100%)` — used only for the sidebar brand lockup background and the page header primary action button. Not used as a general background or card fill.
- **Primary tile gradient:** `linear-gradient(135deg, #402291 0%, #5a2fbf 100%)` — used for the Total Rooms stat tile on the dashboard, giving it a subtle violet depth rather than flat color.
- **Colored borders:** Used as left-edge accents on room cards and as focus rings. Do not use on every card; reserve for status and primary actions.
  - Live left border: `#166534`
  - Scheduled left border: `#0C447C`
  - Ended left border: `#475467`
  - Cancelled left border: `#991B1B`
  - Focus ring: `#402291` with `0 0 0 3px rgba(64,34,145,0.15)`
- **Border system:** Keep the existing neutral border scale. Add colored borders only where the status color system already applies, so the palette stays coherent.

## Role-Based Page Visibility
| Page | Org admin | Event manager | Volunteer |
|------|-----------|---------------|-----------|
| Dashboard | ✓ | ✓ | ✓ |
| Rooms | ✓ | ✓ | ✓ |
| Users | ✓ | ✓ | — |
| Room assignment | ✓ | ✓ | — |
| Forms | ✓ | ✓ | ✓ |
| Reports | ✓ | ✓ | — |
| Profile / Settings | ✓ | ✓ | ✓ (own profile only) |

Sidebar nav renders conditionally off this table. Volunteers do not see Users, Room assignment, or Reports in the MENU/TOOLS groups.

## Anti-Patterns
- No purple gradients as default accent
- No 3-column icon grid feature section
- No centered-everything layout
- No uniform bubbly border-radius on all elements
- No gradient buttons as primary CTA
- No decorative blobs or illustrations
- No dark mode in this iteration

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-25 | Light-only UI, soft lavender background `#F5F3FC` | Single biggest visual gap vs. current build; lavender tint signals brand without overwhelming data |
| 2026-07-25 | Status color system reused everywhere | Keeps room cards, form cards, and report cards coherent; one mapping instead of per-page invention |
| 2026-07-25 | Dashboard 60/40 split with calendar + map | Calendar is cheap and useful; map is placeholder until venue fields exist in schema |
| 2026-07-25 | Poppins + Inter font stack | Poppins carries brand weight for headings; Inter keeps tables and UI readable |
| 2026-07-25 | Sidebar Help expands in place | Keeps Account group compact while preserving access to legal/support links |

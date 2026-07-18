# EventClick — Redesign Brief for Design Agents

Source: `design.md` (brand palette + type + shape language). Apply globally, then per-screen notes below.

## Global Rules (apply everywhere)

**Color**
- Replace current generic dark/teal theme with EventClick palette: primary gradient `#370679→#474EAC→#3262B7` for primary buttons, active nav, hero/header bands.
- Neutral surfaces: `--gray-100 #F4F4FA` (page bg), `--surface #FFFFFF` (cards), `--gray-900` text, `--gray-600` secondary text.
- Semantic: green `#22A06B` success/verified, amber `#D9A404` pending, red `#D93838` error/dispute — use only for status, never decorative.

**Shape / Type**
- Card radius 16px, input/button radius 8px, avatars/badges full-round.
- Headings: Poppins/Sora 600-700. Body: Inter/Manrope 400-500.
- Ring motif (from logo) reused as: loading spinner, "live" pulse dot on active rooms, verified-badge outline.

**Layout (desktop)**
- Persistent left sidebar (nav), top bar for search/profile/notifications. Sidebar active item = gradient pill or left accent bar in `--color-accent`.
- Cards use soft shadow (`--color-primary-dark` @ 8-12% opacity), not hard borders.
- Max content width ~1200px, generous 24-32px gutters — current screens feel cramped/dense; add breathing room.

**Layout (mobile, <768px)**
- Sidebar → bottom tab bar (4-5 icons max: Dashboard, Rooms, Users, Events, Profile) or slide-in drawer via hamburger.
- All forms/modals become full-screen sheets (not centered popups) — thumb-reachable primary action fixed at bottom.
- Tables → stacked card rows (one card per record, key info + status chip, tap to expand).
- Touch targets ≥44px. Single-column everywhere.

---

## Screen-by-Screen

### 1. Sign In
- Desktop: split layout — left brand panel (gradient bg + logo + short tagline), right form panel on white. Replace flat input borders with subtle `--gray-300` outline, focus state = `--color-accent` glow.
- Primary CTA = gradient button, full width.
- Mobile: drop split layout, logo centered top, form full-width below, no side panel.

### 2. Register
- Same shell as Sign In for consistency (shared auth layout component).
- Add lightweight progress indicator if multi-field (role/org info) — small dots or step label, styled with `--color-accent`.
- Mobile: group fields into logical sections with clear spacing, sticky "Continue" button at bottom.

### 3. Dashboard (post-register / first-run)
- Add proper empty state: illustration or icon (ring motif), one-line explainer, single clear CTA ("Create your first room") in gradient button — avoid blank/dense dashboard on first login.
- Once populated: stat cards (rooms, active events, verified attendance) top row, gradient accent only on icons/numbers, not whole card.
- Mobile: stat cards → horizontal scroll strip or 2-column grid; CTA stays fixed bottom.

### 4. Create Room Form
- Convert to a focused modal/side-panel (desktop) with clear section grouping (Room Info → Settings → Assign Users), not one long flat form.
- Inline validation, helper text in `--gray-600`, not just red on error.
- Mobile: full-screen step-by-step (multi-step) form instead of one long scroll — reduces overwhelm.

### 5. Room Created Card (confirmation)
- Success state: checkmark in `--color-success` + ring motif animation, room summary card below, primary actions ("Go to room", "Add users") as gradient + outline button pair.
- Mobile: same content, stacked full-width buttons.

### 6. Room Users / Add User
- Desktop: table → keep table but add avatar, role badge, status chip (invited/active) using semantic colors; row hover = `--color-ring` tint.
- "Add user" as slide-in panel from right, not full-page navigation.
- Mobile: table → card list, one user per card, tap for role/remove actions; add-user = floating gradient action button (bottom-right) opening bottom sheet.

### 7. Event Assignment
- Use a clear two-pane layout: left = event list/calendar, right = assignment detail (who's assigned, room, time) — clarifies relationship between events/rooms/users.
- Status chips (assigned/pending/conflict) in semantic colors.
- Mobile: collapse to single pane, event list first, tap event → assignment detail as full-screen view with back nav.

### 8. Attendance Form Creation (field options)
- This is a builder UI — treat like a form-builder: left = field type palette (text/checkbox/photo/GPS etc.), center = live form preview, right = selected-field settings.
- Field palette icons in `--color-accent`, preview card uses actual app card style so user sees real output.
- Mobile: builder is desktop-primary workflow; on mobile, offer simplified "quick templates" instead of full drag-builder, or reflow to tabbed single-column (Fields → Preview → Settings as tabs).

### 9. After Attendance Form Created
- Confirmation + form summary card (field count, room, status) with gradient "Publish/Activate" CTA and secondary "Edit" link.
- Add share/QR option for attendance capture — icon button, styled per system.
- Mobile: same card, full-width stacked actions.

### 10. Inside Test Room (live room view)
- Most important screen — add a live status header (ring pulse + "Live" badge in `--color-success`) so verification state is obvious at a glance.
- Attendance list below with verified/pending chips; large legible timestamp/photo evidence thumbnails.
- Mobile: header stays sticky on scroll, attendance list as scrollable card stack, key live indicator always visible.

---

## Handoff Notes for Design Agent
- Build shared components first (Button, Card, Input, StatusChip, AuthShell, Sidebar/BottomNav) so all 10 screens inherit consistently — don't restyle screen-by-screen in isolation.
- Deliver both desktop (≥1280px) and mobile (375px) frames per screen.
- Verified/live states are the product's core trust signal — give them the most visual weight across every screen.

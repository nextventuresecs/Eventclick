# Subprocessor register

**Owner:** NVCES founder
**Public list:** https://eventclick.live/gdpr-dpa, section 5 (source: `nextventuresecs/eventclick-landing-page`, `app/gdpr-dpa/page.tsx`)
**Contract clause:** the DPA commits Eventclick to "maintain a current list of subprocessors and inform the Controller of any intended changes, providing the Controller with the opportunity to object to such changes in accordance with Article 28(2) of the GDPR", and states that each listed subprocessor "has entered into a data processing agreement with Eventclick".
**Issue:** #145

This file is the internal record behind the public table: which DPA covers each
subprocessor, when it was accepted, and every change notice sent to customers.
The public page and this register must list the same subprocessors.

---

## Current subprocessors

| Subprocessor | Purpose | Data region | DPA | DPA accepted / link | Verified by, date |
|---|---|---|---|---|---|
| LiveKit Cloud | Real-time video/audio broadcasting | USA / Global | LiveKit DPA | _to record_ | |
| Cloudflare, Inc. | DNS, TLS, CDN, DDoS/WAF for all traffic; access control for internal tools; R2 media storage | Global | Cloudflare Customer DPA (account: the one holding `eventclick.live`) | _to record_ | |
| Amazon Web Services | Hosting, compute, databases, queues, logs, email receiving | India (ap-south-1); Japan (ap-northeast-1) inbound email | AWS GDPR DPA (part of AWS Service Terms) | _to record_ | |
| Resend | Account, notification, broadcast, and contact emails | USA | Resend DPA | _to record_ | |
| Sentry (Functional Software, Inc.) | Error and performance diagnostics; pseudonymous user IDs (after the Ops Console change, #151) | _confirm: Organization Settings → General → Data Storage Location_ | Sentry DPA (Organization Settings → Legal & Compliance) | _to record_ | |

**Not subprocessors:** self-hosted components running on Eventclick's own EC2
instance (Gotenberg PDF rendering, Postgres, Redis).

**Open classification question (out of scope of #145):** Google, via Sign in
with Google (`packages/server/src/services/google.service.ts`) and Google
Analytics on the marketing site. Needs its own legal review.

**Sentry retention:** _record the event retention setting from Sentry
organization settings here_ (relevant to #151: user IDs sent to Sentry persist
until this retention expires).

---

## Change procedure

Follow this for every change to the public subprocessor list.

### 1. Pre-checks (before editing the public page)

- [ ] Every row above has a DPA accepted date or link. If one cannot be
      confirmed, stop: the public page claims each subprocessor has a DPA.
- [ ] Data regions verified at the source (provider console), not assumed.

### 2. Publish the page change

Edit `app/gdpr-dpa/page.tsx` in the landing-page repo, update its
`lastUpdated` constant, deploy, and check `/gdpr-dpa` on desktop and at 400px
width.

### 3. Build the recipient list (read-only query, production)

Every active org admin of every active organization:

```sql
SELECT u.email, u.full_name, o.name AS organization
FROM users u
JOIN organizations o ON o.id = u.organization_id
WHERE u.role = 'admin'
  AND u.is_active = true
  AND u.deleted_at IS NULL
  AND o.is_active = true
  AND o.deleted_at IS NULL
ORDER BY o.name, u.email;
```

Run it as the database owner through SSM on the production instance (for
example `docker exec -i eventclick_postgres_prod psql -U "$DB_USER" -d "$DB_NAME"`).
The tenant role `app_user` would return nothing because of RLS. Do not save
the result anywhere in this repository; record only the count below.

Do **not** use the in-app org broadcast: it is scoped to one organization and
sends in-app and push notifications to every member, not just admins.

### 4. Send the notice

From a monitored NVCES mailbox that receives replies. One email per
organization (or BCC per organization), never one email with every customer
visible to each other.

**Subject:** Eventclick: update to our subprocessor list (effective `<send date + 30 days>`)

**Body:**

> Hello `<name>`,
>
> Under the Data Processing Agreement between `<organization>` and Eventclick, we tell you before we change the list of subprocessors that process personal data on your behalf. We have updated the list at https://eventclick.live/gdpr-dpa (section 5, "Last Updated: `<lastUpdated>`").
>
> What changed:
>
> - **Added: Sentry (Functional Software, Inc.)**, error monitoring, data region `<region>`. Sentry receives technical error reports from the Eventclick app to help us find and fix faults. Reports are filtered to remove passwords and tokens. From `<effective date>`, reports may include a pseudonymous user ID (never a name or email).
> - **Cloudflare**: listed previously for media storage only. The entry now also covers the network services Cloudflare already provides for all Eventclick traffic (DNS, encryption, content delivery, attack protection) and access control for Eventclick's internal support tools.
> - **Amazon Web Services**: location corrected to India (Mumbai), with inbound email handled in Japan (Tokyo). Purpose clarified to include databases, queues, logs, and email receiving.
> - **Resend**: purpose clarified to cover all transactional email (account, notifications, organization announcements, contact forms), not only verification and password reset.
> - **Removed: Gotenberg.** It runs on Eventclick's own infrastructure and was never a separate processor.
>
> These changes take effect on **`<effective date>`**. If you object to any of them, reply to this email before that date and tell us which change and why. We will contact you to discuss it before the change applies to your data.
>
> No action is needed if you do not object.
>
> Thank you,
> `<sender name>`, Eventclick

Replace every `<...>` before sending. The effective date is the send date plus
30 calendar days.

### 5. Record it

Add a row to the change log below on the day the notice is sent, and update
it on the effective date.

### 6. Objections

- **Any objection received before the effective date:** the change that was
  objected to does not apply. For the Sentry user-ID change specifically,
  `SENTRY_SET_USER_ENABLED` and `VITE_SENTRY_SET_USER_ENABLED` (#151) stay
  `false` for everyone. Contact the objecting customer directly and record the
  outcome.
- **No objections by the effective date:** record "none" in the change log.
  #151 may then enable its flags.

---

## Change log

| Notice sent | Recipients (count) | Effective date | Changes | Objections | Outcome recorded |
|---|---|---|---|---|---|
| _pending_ | | | Add Sentry; broaden Cloudflare; correct AWS region and purpose; broaden Resend purpose; remove Gotenberg (landing-page commit `d552eed`) | | |

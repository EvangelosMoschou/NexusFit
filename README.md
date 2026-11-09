# NexusFit

**A white-label gym platform for "Nexus Athletics": marketing landing page + member portal + admin CMS + an AI workout copilot, in one self-hosted Next.js app.**

NexusFit is built as a sellable template for gym owners. The commercial model is
simple: the owner gets a fast, modern, fully-featured website for free, and upsells
the **NexusFit AI Copilot** tier — a paid add-on that generates personalized weekly
training splits (Push/Pull/Legs, Upper/Lower, Full Body) adapted to the member's goal,
experience, schedule and injuries.

Everything is in Greek, mobile-first, offline-capable, and driven by a single
admin-editable configuration object, so the same codebase can be re-branded for
another gym without touching components.

> **Interactive demo:** [evangelosmoschou.github.io/NexusFit](https://evangelosmoschou.github.io/NexusFit/)
> — a browser-only build of the landing page, member portal and AI workout engine.
> It replaces `/api/*` with an in-browser mock and keeps data in `localStorage`
> (`site/src/mockApi.ts`); it is not a hosted instance of the real app.

---

## Quick start

Requires **Node.js 22+** (the app uses the built-in `node:sqlite`).

```bash
npm ci
npm run dev            # http://localhost:3000 — demo members are seeded in dev
```

Log in with member code `NX-8492` / PIN `1234`, or open `/admin` with the
`ADMIN_PASSWORD` you set (dev falls back to `admin`).

```bash
npm test               # 200+ unit tests
npm run check:docs     # docs-vs-code drift
npm run docker:up      # production stack (needs deploy/.env — see Deployment)
```

Everything below is the full reference: features, architecture, env vars, API,
security and deployment.

---

## Table of Contents

- [Quick start](#quick-start)
- [Feature Highlights](#feature-highlights)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Data Layer (SQLite)](#data-layer-sqlite)
- [API Reference](#api-reference)
- [The AI Subsystem](#the-ai-subsystem)
- [White-label Configuration](#white-label-configuration)
- [Multi-tenancy (many gyms, one deployment)](#multi-tenancy-many-gyms-one-deployment)
- [Offline / Lite Mode](#offline--lite-mode)
- [Security](#security)
- [Testing](#testing)
- [Deployment](#deployment)
- [Known Gaps & Roadmap](#known-gaps--roadmap)
- [License](#license)

---

## Feature Highlights

**Public landing page**
- Hero, facilities showcase, weekly class timetable (day filters), pricing tiers
  (Standard vs. All-Access + AI Copilot), expanding FAQ, lead/booking form, footer.
- **Announcements** section for closures, cancelled classes and last-minute changes.
  It is hidden when there are none and is edited from the admin console.
- **Exercise library** before the contact form: searchable cards with muscle
  group, equipment and difficulty, served from the local exercise database.
- **Photo gallery**: the admin uploads gym photos and they appear in a lightbox
  gallery after the facilities section.
- **Location & map**: editable street address and coordinates, an always-loaded
  OpenStreetMap embed and a **«Πώς θα έρθω»** button that opens Google Maps on
  Android/desktop or Apple Maps on Apple mobile devices, starting from the
  visitor's current location. The template ships with White Tower, Thessaloniki
  (`Λεωφόρος Νίκης 1`, `40.62630, 22.94850`).
- **Premium-only live occupancy badge**: members with the premium
  (`has_ai_access`) tier see how many people are inside and the capacity,
  refreshed every minute. Standard members, visitors and expired subscriptions
  get a lock instead of the numbers.
- **Premium occupancy forecast**: day tabs (Monday–Sunday) with average people
  per hour over the last 8 weeks, plus quietest/busiest hours, so premium
  members can plan ahead. Staff see the same chart in Occupancy. Demo mode seeds
  historical visits so the bars are visible immediately.
- Ctrl/Cmd+K **command palette** (`SearchModal`) that searches the exercise database.
- GDPR **cookie consent banner** + Terms/Privacy **legal modals**.
- **PWA**: installable, web manifest, install prompt, scroll progress bar, back-to-top.
- UTM parameter capture into `sessionStorage` for campaign attribution.

**Member portal** (after member-code + PIN login)
- Four stat cards, tabs for **Active Split**, plan **history**, **weight logs**, and
  **today's classes**.
- **AI Workout Wizard** — 4 steps (goal → experience/frequency → injuries → duration)
  that produces a full weekly plan with sets, reps, RPE, rest times, warm-up protocol
  and a cardio recommendation.
- **Check-in / «Τέλος προπόνησης»** that feeds the live occupancy count, from the
  portal or from a tablet at the entrance (`/checkin`). An activity heartbeat and
  weight logs keep an open visit alive; idle visits close automatically after a
  configurable window (default 60 minutes, `0` disables it).
- **In-app notifications** in the profile dropdown: subscription expiry, gym
  announcements and schedule updates, with unread badges and mark-as-read. They
  are derived idempotently from the member's state and the current config, so
  existing announcements/schedules appear without a migration.
- **Access control**: a rotating signed QR (90 seconds) in the member portal and
  a device-authenticated scanner endpoint with explicit `in`/`out` direction.
  Anti-passback blocks a second entry while inside and rejects exit without
  entry. Re-entry cooldown defaults to **0** (humans may need to step out), but
  duplicate entries and quick exit→re-enter events are tracked; more than one in
  a rolling 7 days raises an admin alarm. Staff can always override at the desk.
- **Subscription gating**: occupancy, capacity and the forecast require the
  **premium** tier (`has_ai_access`). Any active standard subscription can still
  check in/out and see its own 30-day visit count, but not the aggregate. Expired
  members can log in and close an open visit, but cannot check in.
- **Manual Workout Builder** for members who want to hand-craft a plan.
- **AI Coach chat modal** for questions about exercises, substitutions, sets/reps
  and nutrition.
- Per-exercise **weight logger** with progressive-overload history.
- A **Code 39 barcode** of the member code on the access card.
- Print/PDF export and copy-to-clipboard of any plan.

**Admin console** (`/admin`, 11 tabs)
- **Leads** — list inquiries and move them through `pending → contacted → registered`.
- **Members** — create/update/delete members, toggle their AI-pass tier, search by
  name/code/email, and open a profile with the barcode and saved-plan history.
  Members with an access alarm get a **Προσοχή** badge. Deleting a member is the
  full GDPR erasure path (plans, visits, matching leads).
- **Occupancy** — live count, who is inside, checkout at the desk and recent visits.
  Capacity, idle auto-checkout and access cooldown are edited in **Info**.
- **Access** — weekly anomaly tracker: duplicate check-ins and quick exit→re-entry
  (within 30 minutes), with an alarm above one event per rolling 7 days and a
  direct link to the member profile.
- **Staff** — create multiple named admins or trainers, set trainer permissions,
  reset passwords, deactivate accounts and permanently delete them (GDPR). The
  deleted account's audit history is anonymized, not destroyed.
- **Audit log** — append-only history of staff/admin logins and writes with
  actor, action, entity, details, IP and 12-month retention. Filter by action or
  entity and paginate.
- **Announcements** — publish, edit or remove the notices shown on the landing page.
- **Photos** — upload, preview and delete gallery images (JPG/PNG/WebP/AVIF).
- **Pricing / Schedule / Info** — each edits one slice of the live gym config, which
  immediately propagates to the public site. **Info** also contains the street
  address, phone and map coordinates.

**Trainer area** (`/trainer`, permission-based)
- Staff trainer accounts sign in with email + password. Their tabs and actions are
  controlled by permissions: `members_view`, `occupancy_view`, `occupancy_manage`,
  `announcements_manage`, `schedule_manage`.
- The legacy shared `TRAINER_PASSWORD` still works as a fallback with the original
  capabilities. The server enforces every permission; hiding a tab is not the
  security boundary.
- The fallback `ADMIN_PASSWORD` remains an owner/recovery credential; staff admin
  accounts are managed from **Admin → Προσωπικό**.

**Resilience**
- Deterministic **local AI fallback** — the coach still answers with zero network and
  zero token cost.
- **Lite Mode** — an ultra-light, zero-bandwidth gym-floor view that auto-engages on
  2G / slow-3G / offline connections (or via a manual toggle).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16.4.3** (App Router, React Server Components, Turbopack, `output: "standalone"`) |
| UI | **React 19.3**, **TailwindCSS 3.4**, **lucide-react** icons |
| Language | **TypeScript 5** (strict) |
| Database | **`node:sqlite`** (`DatabaseSync`) — Node's built-in SQLite, no external driver |
| AI | **Google Gemini** (`gemini-2.0-flash-lite`) with a local deterministic fallback |
| Testing | **Vitest 5** (Node environment) |
| Demo | **Vite 8** static build with an in-browser mock API (GitHub Pages) |
| Lint | ESLint 9 + `eslint-config-next` (flat config, `eslint.config.mjs`) |
| Runtime | **Node.js 22** (Docker image is `node:22-alpine`) |

There are only **four** runtime dependencies (`next`, `react`, `react-dom`,
`lucide-react`). No ORM, no auth library, no state manager, no CSS-in-JS — the
whole platform is deliberately dependency-light and self-hostable.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser                                                            │
│                                                                     │
│  src/app/page.tsx  ── one client entry, three modes:                │
│    ├─ Public landing page       (not logged in)                     │
│    ├─ MemberPortalPage          (logged in, full dashboard)         │
│    └─ GymFloorLiteMode          (logged in, slow/offline network)   │
│                                                                     │
│  Heavy modals are code-split via next/dynamic (ssr: false).         │
│  Client persistence: localStorage + cookies (src/lib/storage.ts,    │
│  src/lib/auth.ts). Server persistence: POST /api/member/workouts.   │
└─────────────────────────────────────────────────────────────────────┘
                │  fetch (JSON, { success, ... } envelope)
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Next.js Route Handlers  (src/app/api/**)                           │
│                                                                     │
│  Public:  /api/config · /api/leads · /api/auth/member ·             │
│           /api/member/workouts · /api/ai-agent/chat · /api/health   │
│  Admin:   /api/admin/{auth,config,leads,members}                    │
│           └─ wrapped by adminRoute() → SHA-256 cookie guard         │
└─────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  src/lib/sqliteDb.ts  — lazy singleton over node:sqlite             │
│  Tables: members · workout_plans · lead_inquiries · site_config     │
│  File:   data/nexusfit.db   (override dir via SQLITE_DATA_DIR)      │
└─────────────────────────────────────────────────────────────────────┘
```

**Data flow for a generated plan:** the browser's `aiWorkoutEngine` builds the plan
deterministically (no server round-trip) → it is stored locally via `storage.ts` /
`auth.ts` → if the member is logged in it is also `POST`ed to `/api/member/workouts`
for server-side persistence. The plan's JSON is stored verbatim in `plan_json`, so the
stored shape always matches `GeneratedWorkoutPlan`.

---

## Project Structure

```
NexusFit/
├── README.md                     ← you are here
├── LICENSE                       GNU AGPL-3.0
├── NOTICE                        Commercial licensing & trademark notice
├── SECURITY.md                   Vulnerability disclosure + response policy
├── package.json                  Scripts & the five runtime deps
├── next.config.ts                Standalone output, security headers, lucide tree-shaking
├── tailwind.config.ts            CSS-variable theme tokens (charcoal / sky-cyan default)
├── vitest.config.ts              Node env, "@" → src alias
├── eslint.config.mjs             eslint-config-next + jsx-a11y + prettier
├── tsconfig.json
├── .gitleaks.toml                Secret-scanning rules and allowlists
├──
├── data/                         SQLite databases live here (gitignored)
│   ├── nexusfit.db               Default tenant
│   └── registry.db               Tenant registry (host → tenant)
│
├── public/
│   ├── manifest.webmanifest      PWA manifest
│   ├── icons/icon.svg
│   └── .well-known/security.txt  RFC 9116 contact (replace the placeholders)
│
├── deploy/                       Production assets (see Deployment)
│   ├── Dockerfile                Multi-stage node:22-alpine → standalone runner
│   ├── docker-compose.yml        app + Caddy TLS + db-backup + retention sidecars
│   ├── Caddyfile                 TLS reverse proxy
│   ├── ecosystem.config.js       PM2 cluster config
│   ├── backup.mjs                VACUUM INTO snapshots (runs in the backup sidecar)
│   ├── backup-db.sh              Cron alternative for non-Docker hosts
│   ├── start.sh
│   ├── .env.production.example
│   ├── DEPLOYMENT_GUIDE.md
│   ├── HETZNER.md                Step-by-step VPS notes
│   └── PROJECT_FILES_CHECKLIST.txt
│
├── docs/
│   ├── README.md                 Docs index
│   ├── CI.md                     Gitea/Forgejo Actions pipeline + runner setup
│   ├── MONITORING.md             Uptime / 401-probe / log rotation / backups
│   ├── security/                 Disclosure policy + supply-chain gates
│   │   ├── README.md             Standards map and pre-deploy checklist
│   │   └── supply-chain.md       Gitleaks · Semgrep · CodeQL · Trivy · SBOM
│   └── 50_RULES_WEBSITE_CHECKLIST.txt  30 anti-patterns + 20 essential features
│
├── scripts/
│   ├── create-tenant.mjs         Tenant provisioning CLI (npm run tenant:create)
│   ├── set-tenant-password.mjs   Rotate admin/trainer passwords (npm run tenant:password)
│   └── check-docs-drift.mjs      Docs-vs-code drift check (npm run check:docs)
│
├── site/                         Static interactive demo (Vite → GitHub Pages)
│   ├── src/                      Demo shell + in-browser mock API
│   ├── vite.config.mts
│   └── index.html
│
├── .github/workflows/            pages.yml (demo → Pages), codeql.yml, security.yml
├── .gitea/workflows/ci.yml       Primary CI: audit · lint · typecheck · test · demo · build
│
└── src/
    ├── app/
    │   ├── layout.tsx            Root layout, Greek metadata, PWA link, dark theme
    │   ├── page.tsx              Client entry: landing ⇄ portal ⇄ lite mode
    │   ├── admin/page.tsx        Admin console (login + 11 tabs)
    │   ├── checkin/page.tsx      Entrance tablet (PIN check-in/out)
    │   ├── trainer/page.tsx      Permission-based staff area
    │   ├── error.tsx loading.tsx App Router error and loading boundaries
    │   ├── not-found.tsx         404
    │   ├── 401/ 403/ 404/        Status pages
    │   ├── globals.css
    │   └── api/**/route.ts       REST handlers (see API Reference)
    │
    ├── components/
    │   ├── Navbar Hero Facilities Timetable Pricing FAQ LeadBooking
    │   ├── Footer CookieBanner LegalModal SearchModal
    │   ├── ScrollTopButton ScrollProgressBar FloatingContact PWAInstallPrompt
    │   ├── WeightLoggerInput.tsx
    │   ├── admin/      LeadsTab · MembersTab · MemberDetailModal · OccupancyTab ·
    │   │               AccessTab · StaffTab · AuditTab · AnnouncementsTab ·
    │   │               MediaTab · PricingTab · ScheduleTab · InfoTab
    │   ├── ai/         WorkoutWizard · WorkoutDisplay · AICoachChatModal
    │   ├── auth/       LoginModal
    │   ├── dashboard/  MemberPortalPage · GymFloorLiteMode
    │   ├── member/     MemberSessionsCard (active devices / revoke)
    │   ├── status/     StatusPage (401 / 403 / 404 shell)
    │   ├── trainer/    TrainerDashboard · TrainerMemberList
    │   └── workout/    ManualWorkoutBuilderModal
    │
    ├── config/gymConfig.ts       defaultGymConfig — the white-label source of truth
    ├── data/exercisesData.ts     23 exercises (GR/EN names, muscle group, injury risks)
    ├── lib/                      Business logic & data access (see below)
    ├── proxy.ts                  CSRF guard for mutating /api/* requests
    └── types/
        ├── index.ts              All shared TypeScript types
        └── sqlite.d.ts           Module declaration for node:sqlite
```

**`src/lib/` at a glance**

| File | Responsibility |
|---|---|
| `sqliteDb.ts` | All data access: schema creation, seeding, PIN migration, member/plan/lead/config CRUD, input validation. Each function takes a `tenantId` (defaults to the default tenant). |
| `db/` | The storage seam: `repository.ts` (async `Repository` interface), `sqliteRepository.ts` (per-tenant SQLite implementation), `index.ts` (`getRepository(tenantId)`), `types.ts`, plus the per-entity query modules (`members`, `staff`, `leads`, `media`, `visits`, `gymConfig`, `notifications`, `accessEvents`, `audit`, `memberSessions`, `schema`, `connection`, `tenant`). Swapping to Postgres means one new implementation here. |
| `tenants.ts` | Tenant registry (`data/registry.db`), host → tenant resolution with caching, tenant creation. |
| `subscription.ts` | Subscription/tier gating: active flag plus a date comparison, so an expired plan loses premium features. |
| `memberNotifications.ts` | Idempotent in-app notification generation (expiry, announcements, schedule) with `dedupe_key` hashing. |
| `accessEvents.ts` | Duplicate-entry and quick-re-entry anomaly detection for the weekly access alarm. |
| `visitActivity.ts` | Heartbeat that keeps a member's open visit alive; ignored when the member is not checked in. |
| `occupancyAnalytics.ts` | Weekday/hour bucketing of visits into the occupancy forecast (averages, quietest/busiest hours). |
| `aiWorkoutEngine.ts` | Deterministic plan generator: split-by-frequency, goal-driven sets/reps/RPE/rest, injury-safe exercise selection. |
| `aiAgentChat.ts` | Zero-cost local chat engine (injury/alternative/nutrition/sets-reps intents). |
| `aiSafetyHarness.ts` | Pre-flight persona-lock, out-of-scope & medical/steroid red-flag filters, trusted-domain list, system-prompt builder. |
| `api.ts` | `adminRoute()` / `trainerRoute()` — tenant-aware auth + permission guards and a consistent error envelope. |
| `audit.ts` / `auditActions.ts` | Best-effort audit writer, actor normalization, action/entity labels. |
| `session.ts` | HMAC-SHA256 signing/verification of member, legacy trainer and staff session cookies (`SESSION_SECRET`). Member tokens carry a session id and absolute expiry. |
| `memberSessions.ts` | Server-side member sessions: SHA-256 session-id storage, idle/absolute timeout, touch throttling, per-session revocation and logout-all. |
| `sameOrigin.ts` | CSRF helper behind `src/proxy.ts`: mutating-method detection and `Origin`-vs-host comparison for `/api/*`. |
| `geminiModel.ts` | Resolves and validates the `GEMINI_MODEL` id (it becomes a URL path segment) and builds the Gemini `generateContent` endpoint. |
| `adminAuth.ts` | Legacy SHA-256 admin session cookie (`ADMIN_PASSWORD`-derived). |
| `staffAuth.ts` | Named staff accounts: DB-checked sessions, login, permissions, password-hash binding. |
| `trainerAuth.ts` | Legacy shared trainer login and the restricted trainer role (view members/occupancy, desk check-in). |
| `staffPermissions.ts` | Permission keys, defaults, normalization and role checks. |
| `cookies.ts` | Cookie names (`nexusfit_*`; `__Host-` prefixed in production), `Secure`/`HttpOnly`/`SameSite` attributes and the shared `buildSessionCookie()` helper. |
| `accessToken.ts` | Rotating HMAC-signed QR access tokens (90 s TTL) for the entrance scanner. |
| `occupancyAccess.ts` | Who may see live/historical occupancy: premium members, or staff with the right permission. |
| `consent.ts` | Cookie-consent preferences persisted on the client. |
| `apiClient.ts` | Browser fetch wrapper that normalises the `{ success, error, message }` envelope. |
| `memberFetch.ts` | Member-only fetch wrapper: a `401` means the server session was revoked/expired, so it clears local state instead of showing a PIN error. |
| `format.ts` | Small shared formatting helpers. |
| `flags.ts` | Boolean-ish environment flags (`1`/`true`/`yes`) such as `DEMO_MODE`. |
| `maps.ts` | Directions URL builder (Google Maps on Android/desktop, Apple Maps on Apple mobile). |
| `scroll.ts` | In-page navigation that keeps the URL clean (no hash spam on section links). |
| `useEscapeKey.ts` | Escape-key dismissal hook used by modals. |
| `passwordHash.ts` | Async scrypt hash/verify with `timingSafeEqual` (sync variants only for seeding). |
| `rateLimit.ts` | In-memory fixed-window rate limiter + `getClientIp()`. |
| `auth.ts` | Client member session model (localStorage + cookie). |
| `storage.ts` | Client localStorage: saved plans and progressive-overload exercise logs. |
| `useGymConfig.ts` | Fetches `/api/config` once per session, falls back to `defaultGymConfig`. |
| `useNetworkStatus.ts` | Connection quality + manual Lite Mode toggle. |
| `useLocalAgentChat.ts` | Shared offline chat hook used by the chat modal and lite mode. |
| `useUTM.ts` | Captures UTM params into `sessionStorage`. |
| `testUtils/` | Test-only helpers — `browserStorage.ts` installs a `localStorage`/`window` shim so browser-storage code runs under the default Node test environment. |

---

## Getting Started

**Requirements:** Node.js **22+** (the project uses the built-in `node:sqlite`, which
requires Node 22+), npm.

```bash
# 1. Install dependencies
npm install

# 2. (Optional) configure the AI key and admin password
cp deploy/.env.production.example .env.local

# 3. Development server
npm run dev          # http://localhost:3000

# 4. Production build
npm run build && npm run start
#   or run the standalone server directly:
npm run serve:prod   # node .next/standalone/server.js
```

**Demo credentials** (seeded on first run in an empty database, **only when
`NODE_ENV !== "production"`** — a real deployment never creates accounts with
known PINs unless you explicitly set `DEMO_MODE=1` (or `SEED_DEMO_MEMBERS=1`),
which exists for throwaway demo instances):

| Member code | PIN | Tier |
|---|---|---|
| `NX-8492` | `1234` | All-Access **+ AI Copilot** |
| `NX-3109` | `1234` | Standard (no AI access) |

In demo mode, `NX-3109` is also seeded with two recent access anomalies, so
**Admin → Πρόσβαση** shows a flagged profile and the member list shows a
**Προσοχή** badge. Demo mode also seeds 8 weeks of historical visits so the
occupancy forecast chart has data.

The admin panel lives at `/admin` and accepts the legacy `ADMIN_PASSWORD` (owner/
recovery) or a named staff admin account created from **Admin → Προσωπικό**.
Without `ADMIN_PASSWORD` the default tenant is not seeded and admin login
returns `503`.

**npm scripts**

| Script | Purpose |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (standalone output) |
| `npm start` | `next start` |
| `npm run serve:prod` | Run the self-contained standalone server |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | `vitest run` |
| `npm run format` | Prettier write |
| `npm run format:check` | Prettier check (no writes) |
| `npm run check:docs` | Verify the docs still match the code (see [Testing](#testing)) |
| `npm run audit:prod` | `npm audit --omit=dev --audit-level=high` |
| `npm run sbom` | Generate a CycloneDX SBOM (`sbom.json`) |
| `npm run tenant:create -- <id> <name> <domain> <password> [trainerPassword]` | Provision a tenant (see [Multi-tenancy](#multi-tenancy-many-gyms-one-deployment)) |
| `npm run tenant:password -- <id> <admin\|trainer> <password>` | Set or rotate a tenant's admin/trainer password |
| `npm run demo:dev` | Vite dev server for the interactive demo (port 5174) |
| `npm run demo:build` | Static demo build into `site/dist` |
| `npm run demo:preview` | Serve the built demo locally |
| `npm run docker:build` | Build the application image |
| `npm run docker:up` | `docker compose up -d --build` (see [Deployment](#deployment)) |
| `npm run docker:down` | `docker compose down` |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | No | — | Google AI Studio key. When absent, the AI chat uses the local engine. |
| `GEMINI_MODEL` | No | `gemini-2.0-flash-lite` | Gemini model id used by `/api/ai-agent/chat`. Validated as a URL path segment; a malformed value falls back to the default instead of failing the request. |
| `ADMIN_PASSWORD` | For admin | — | Seeds the **default tenant's** admin password in the registry on first run. In production a missing value does **not** fall back to a default: the tenant is not seeded and admin login returns `503`. Development falls back to `admin` for convenience. Additional tenants get their own password via `npm run tenant:create`. |
| `SESSION_SECRET` | Production | — | HMAC key used to sign member session cookies. Member login returns `503` in production if unset or shorter than 16 characters. Generate with `openssl rand -hex 32`. |
| `MEMBER_SESSION_IDLE_SECONDS` | No | `604800` (7 days) | Idle timeout for a member session; minimum 60 seconds. A request after this window revokes the session. |
| `MEMBER_SESSION_ABSOLUTE_SECONDS` | No | `2592000` (30 days) | Absolute session lifetime from login; also used as the cookie `Max-Age`. |
| `MEMBER_SESSION_TOUCH_SECONDS` | No | `60` | Minimum interval between `last_seen_at` writes; avoids a database write on every polling request. |
| `MEMBER_SESSION_MAX_ACTIVE` | No | `10` | Maximum active sessions per member (1–100); the oldest sessions are revoked when a new login exceeds the cap. |
| `CRON_SECRET` | For retention | — | Shared secret required by `POST /api/cron/retention`. The route returns `503` if unset. |
| `SQLITE_DATA_DIR` | No | `<cwd>/data` | Directory for the SQLite files: `nexusfit.db` (default tenant), `registry.db` (tenant registry) and one database per additional tenant. Useful on read-only filesystems (e.g. Vercel → `/tmp`). When `VERCEL` is set and this is missing, the app falls back to `/tmp/nexusfit` and logs a warning. |
| `DEMO_MODE` | No | — | One-variable demo setup: seeds the demo members (`NX-8492` / `NX-3109`, PIN `1234`), the admin password `admin1`, the trainer password `trainer1` and a known demo session secret, even when `NODE_ENV=production`. **Never on a real deployment.** |
| `SEED_DEMO_MEMBERS` | No | — | Narrower alternative to `DEMO_MODE`: seeds only the demo members (`NX-8492` / `NX-3109`, PIN `1234`) in production. Demo instances only. |
| `TRAINER_PASSWORD` | No | — | Optional legacy shared trainer password for the default tenant. Staff trainer accounts created in Admin → Προσωπικό do not depend on it. Unset in production disables only the legacy shared login; development/demo fall back to `trainer1`. Rotate with `npm run tenant:password -- default trainer '<new>'`. |
| `ACCESS_CONTROL_KEY` | For QR access | — | Shared secret (16+ chars) that the entrance scanner sends in `x-access-key` to `POST /api/access/scan`. Unset disables QR access. |
| `GYM_TIMEZONE` | No | `Europe/Athens` | Timezone used to group visits into weekday/hour buckets for the occupancy forecast. |
| `NEXT_PUBLIC_SITE_URL` | No | — | Canonical site URL used for SEO metadata (`metadataBase`). Build-time: rebuild to change. |
| `NEXT_PUBLIC_THEME_PREVIEW` | No | shown | Build-time flag. Set to `0` to hide the theme preview control and the `?theme=` override. Unset (e.g. a Vercel preview) shows them; the Docker build defaults to `0`. |
| `PORT` / `HOSTNAME` | No | `3000` / — | Standalone/Docker server binding (read by the Next.js server, not by app code). |
| `SITE_DOMAIN` | Docker only | `localhost` | Domain Caddy uses for TLS in `docker-compose.yml`. |
| `DATA_DIR` | Docker only | `/data` | Directory the **backup sidecar** (`deploy/backup.mjs`) snapshots. Set in `docker-compose.yml`; not read by the app. |
| `BACKUP_DIR` | Docker only | `/backups` | Where the backup sidecar writes its snapshots. Set in `docker-compose.yml`. |
| `BACKUP_RETENTION_DAYS` | Docker only | `14` | How many days of snapshots the backup sidecar keeps. Set in `docker-compose.yml`. |

> **Model selection:** `GEMINI_MODEL` overrides the default `gemini-2.0-flash-lite`
> (see the table above). The value is validated as a URL path segment, so a typo
> falls back to the default rather than breaking the copilot.

---

## Data Layer (SQLite)

Access goes through `src/lib/sqliteDb.ts`, a stable **re-export facade** over the
modules in `src/lib/db/` (`connection`, `schema`, then one module per table family).
Callers keep importing the same names; the split is invisible to them. `getDatabase()`
in `db/connection.ts` is a lazy per-tenant singleton: it creates the data directory,
opens the tenant's database, creates the schema and seeds defaults on first use.

**Schema**

| Table | Key columns | Notes |
|---|---|---|
| `members` | `id`, `member_code` (unique), `email` (unique), `pin_code`, `tier_name`, `has_ai_access`, `subscription_status`, `expires_at`, `created_at` | `pin_code` stores an `scrypt:…` hash. |
| `workout_plans` | `id`, `member_id` (FK → members, `ON DELETE CASCADE`), `split_name`, `split_type`, `days_per_week`, `session_duration`, `plan_json`, `created_at` | `plan_json` is the full `GeneratedWorkoutPlan`. |
| `lead_inquiries` | `id`, `full_name`, `email`, `phone`, `goal`, `preferred_plan`, `notes`, `status`, `created_at` | `status`: `pending` / `contacted` / `registered`. |
| `site_config` | `key` (PK), `value`, `updated_at` | The white-label config, stored under key `gym_config`. |
| `media` | `id`, `filename`, `mime`, `size`, `alt`, `data` (BLOB), `created_at` | Gallery photos, stored in the tenant database so backups and isolation cover them. |
| `visits` | `id`, `member_id` (FK → members, `ON DELETE CASCADE`), `checked_in_at`, `checked_out_at`, `last_activity_at`, `created_at` | One row per visit; open visits (`checked_out_at IS NULL`) feed the occupancy count. Idle visits close after the configured window; older than 8 hours are always stale. |
| `staff_accounts` | `id`, `name`, `email` (unique), `role` (`admin`/`trainer`), `password_hash`, `permissions` (JSON), `active`, `created_at`, `updated_at`, `last_login_at` | Named staff accounts per tenant. Deleting the row removes the account and invalidates its sessions; password hashes never leave the server. |
| `audit_log` | `id`, `actor_id`, `actor_name`, `actor_email`, `actor_role`, `actor_legacy`, `action`, `entity_type`, `entity_id`, `details` (JSON), `ip`, `created_at` | Append-only staff/admin action history. Retained 12 months and purged by the retention cron; actor identifiers are anonymized when a staff account is deleted. |
| `member_notifications` | `id`, `member_id` (FK → members, `ON DELETE CASCADE`), `type`, `title`, `body`, `dedupe_key`, `read_at`, `created_at` | In-app notification feed. Unique `(member_id, dedupe_key)` makes generation idempotent; deleted with the member. |
| `member_sessions` | `session_id_hash` (PK), `member_id` (FK → members, `ON DELETE CASCADE`), `created_at`, `last_seen_at`, `expires_at`, `revoked_at`, `ip`, `user_agent` | Server-side member sessions. Only the SHA-256 hash of the session id is stored; expiry and revocation are enforced on every member API. Expired/revoked rows are purged by the retention cron. |
| `access_events` | `id`, `member_id` (FK → members, `ON DELETE CASCADE`), `event_type`, `details` (JSON), `created_at` | Duplicate-entry and quick-re-entry anomalies for the weekly alarm. Retained 12 months and purged by the retention cron. |

**Guarantees**
- **PIN hashing** — `passwordHash.ts` uses async `scrypt` with a per-hash salt and compares
  with `timingSafeEqual`. A one-time idempotent migration re-hashes any legacy
  plaintext PINs found in the table.
- **PINs never leave the server** — `getAllMembersAdmin()` selects an explicit column
  list that omits `pin_code`; the admin API can never return it.
- **Input validation** at the boundary — email regex, PIN format `^\d{4,6}$`, name
  length 2–80, notes truncated to 2000 chars.
- **Graceful degradation** — `getSavedGymConfig()` falls back to `defaultGymConfig`
  if the row is missing or corrupt, so the site always renders.

---

## API Reference

All endpoints return a `{ success: boolean, ... }` JSON envelope. Admin endpoints are
wrapped by `adminRoute()`, which accepts the legacy admin cookie or a named staff
admin's staff cookie (`nexusfit_admin` / `nexusfit_staff`; `__Host-` prefixed in
production). Trainer endpoints use `trainerRoute()`,
which accepts a staff trainer or the legacy trainer cookie and enforces the required
permission. Both return `401 { success: false, error: "Unauthorized" }` when the
session is missing/invalid, `403` for a missing permission, and `500` with a
standard error message if the handler throws.

### Public

| Method | Path | Body / Notes | Responses |
|---|---|---|---|
| `GET` | `/api/health` | Uptime probe (`force-dynamic`). | `200 { success, ok, uptime, timestamp }` |
| `GET` | `/api/config` | Admin-editable gym config for the public site. | `200 { success, config }` |
| `POST` | `/api/leads` | `{ fullName, email, phone?, goal?, preferredPlan?, notes? }`. | `200 { success }`, `400` missing name/email |
| `POST` | `/api/auth/member` | `{ identifier, pin }` (member code **or** email + PIN). Creates a server-side session and sets the **HMAC-signed** member cookie (`nexusfit_member_id`; `__Host-` prefixed in production; HttpOnly, `Secure` in prod, `SameSite=Lax`; cookie up to 30 days, server idle timeout 7 days by default). | `200 { success, member }`, `400`, `401`, `503` (no `SESSION_SECRET`), `500` |
| `POST` | `/api/auth/logout` | Revokes the current server-side session and clears the cookie. `{ "all": true }` revokes every session for the member. | `200 { success, all }` |
| `GET` | `/api/member/sessions` | Lists the member's active sessions (hashed id, created/last-seen/expiry, IP, user agent, `current`). | `200 { success, sessions }`, `401` |
| `DELETE` | `/api/member/sessions?id=<hashed-id>` | Revokes one of the member's sessions; revoking the current one also clears the cookie. | `200 { success, revokedCurrent }`, `400`, `401`, `404` |
| `POST` | `/api/member/workouts` | `{ plan }`. Requires the member session cookie (`nexusfit_member_id`, or its `__Host-` production name). | `200 { success }`, `400` missing plan, `401` not authenticated |
| `GET` | `/api/member/export` | GDPR access/portability: downloads the signed-in member's data, plans, visits, notifications, access events and session history as JSON (`Content-Disposition: attachment`). Requires the member cookie. | `200` file, `401`, `404` |
| `GET` | `/api/member/notifications` | In-app notification feed; generates missing expiry/announcement/schedule entries idempotently. | `200 { success, notifications, unreadCount }`, `401`, `404` |
| `POST` | `/api/member/notifications` | `{ markAll: true }` or `{ id }` to mark read. | `200 { success, unreadCount }`, `400`, `401` |
| `GET` | `/api/member/access-token` | Rotating signed QR token (90 s) for the entrance scanner. Requires an active subscription and configured access control. | `200 { success, token, expiresAt }`, `401`, `403`, `503` |
| `DELETE` | `/api/member/erase` | GDPR erasure: deletes the signed-in member, their plans (cascade) and any lead inquiries sharing their email, then clears the cookie. | `200 { success }`, `401` |
| `POST` | `/api/cron/retention` | Deletes lead inquiries older than 12 months, closes idle/stale visits, purges audit entries/access events older than 12 months and expired/revoked member sessions. Requires the `x-cron-secret` header. | `200 { success, removed, visitsClosed, idleVisitsClosed, auditPurged, accessEventsPurged, memberSessionsPurged, tenants }`, `401`, `503` (no `CRON_SECRET`) |
| `POST` | `/api/ai-agent/chat` | `{ query }`. Rate-limited per IP. | `200 { id, sender, text, timestamp, … }`, `400`, `429` (with `Retry-After`), `500` |
| `GET` | `/api/media` | Published gallery metadata. | `200 { success, media }` |
| `GET` | `/api/media/{id}` | Image bytes (`Cache-Control: immutable`, `nosniff`). | `200` image, `404` |
| `GET` | `/api/occupancy` | Premium-member-only live count. Standard members, non-members and expired subscriptions get `{ locked: true }` without numbers; admin/trainer cookies are allowed. | `200 { success, locked, inside?, capacity?, updatedAt }` |
| `GET` | `/api/occupancy/analytics` | `?weeks=8` (1–26). Premium-only average presence per weekday/hour from visits; same staff access as live occupancy. | `200 { success, locked, weeks, days, capacity, timezone }` |
| `POST` | `/api/checkin` | Entrance kiosk: `{ identifier, pin, action: "in" \| "out" }`. Rate-limited; no session is created. Any active subscription may check in/out; occupancy is returned only for Premium. | `200 { success, memberName, status, locked, occupancy }`, `400`, `401`, `403`, `404`, `429` |
| `GET` | `/api/member/visit` | Signed-in member's visit status; aggregate occupancy only with Premium. | `200`, `401`, `404` |
| `POST` | `/api/member/visit` | `{ action: "in" \| "out" \| "heartbeat" }`. Check-in requires an active subscription; checkout/heartbeat are always allowed; aggregate occupancy is Premium-only. | `200`, `400`, `401`, `403`, `404` |
| `POST` | `/api/access/scan` | Entrance turnstile/scanner only (not browsers): `{ token, direction: "in" \| "out" }` with `x-access-key: $ACCESS_CONTROL_KEY`. See [Access control](#access-control-device-authenticated). | `200 { success, allowed, direction, memberName, memberCode, status, occupancy }`, `400`, `401`, `403`, `404`, `409` (not inside), `429`, `503` (not configured) |

### Access control (device-authenticated)

`POST /api/access/scan` is for the entrance turnstile/scanner, not browsers. It
requires `x-access-key: $ACCESS_CONTROL_KEY` and a signed rotating token from
`GET /api/member/access-token`.

```bash
curl -X POST https://<domain>/api/access/scan \
  -H "content-type: application/json" \
  -H "x-access-key: $ACCESS_CONTROL_KEY" \
  -d '{"token":"<qr-token>","direction":"in"}'
```

- `in`: denies while already inside, when the subscription is inactive, or
  during the configured re-entry cooldown.
- `out`: denies when the member is not inside.
- Denials are written to the audit log (`access.denied`) with reason and IP.

### Admin (require the legacy admin or named staff-admin session)

| Method | Path | Body | Purpose |
|---|---|---|---|
| `POST` | `/api/admin/auth` | `{ email?, password }` | With `email`, logs in a named staff admin and sets the signed staff cookie. Without `email`, uses the legacy `ADMIN_PASSWORD` and legacy admin cookie (8 h; plain names in dev, `__Host-` prefixed and `Secure` in production). `503` if sessions are unconfigured, `401` if wrong. |
| `POST` | `/api/admin/logout` | — | Clears both the legacy admin and staff session cookies. |
| `GET` | `/api/admin/me` | — | Verifies the HttpOnly session (also logs out deleted/deactivated staff accounts). |
| `GET` | `/api/admin/staff` | — | List staff accounts (never password hashes). |
| `POST` | `/api/admin/staff` | `{ name, email, role, password, permissions? }` | Create an admin or trainer account. Passwords are scrypt-hashed. |
| `PATCH` | `/api/admin/staff` | `{ id, permissions?, active?, password?, … }` | Update permissions, active state or reset a password. Self-demotion/deactivation is blocked. |
| `DELETE` | `/api/admin/staff` | `?id=` | Permanently delete a staff account (GDPR), invalidate its sessions and anonymize its audit history. Self-deletion is blocked. |
| `GET` | `/api/admin/audit` | `?limit=&offset=&action=&entityType=&actorId=&from=&to=` | Paginated, filterable audit history (max 200 rows/page). Admin-only. |
| `GET` | `/api/admin/config` | — | Read the saved gym config. |
| `POST` | `/api/admin/config` | `{ config }` | Merge-and-save gym config. `400` if body missing. |
| `GET` | `/api/admin/leads` | — | List all leads. |
| `DELETE` | `/api/admin/leads` | `?id=` | Delete a lead inquiry (GDPR erasure). |
| `POST` | `/api/admin/leads` | `{ … }` | Update a lead's status. |
| `GET` | `/api/admin/members` | — | List members (**never** includes `pin_code`). |
| `POST` | `/api/admin/members` | member fields | Create or update a member (upsert on `member_code`). |
| `DELETE` | `/api/admin/members` | `?id=` | Permanent GDPR erasure: member, plans, visits and lead inquiries with the same email. |
| `GET` | `/api/admin/media` | — | List gallery photos with URLs and sizes. |
| `POST` | `/api/admin/media` | multipart `file`, `alt` | Upload a photo. The MIME type is detected from the bytes; max 4 MB, JPG/PNG/WebP/AVIF. |
| `DELETE` | `/api/admin/media` | `?id=` | Delete a photo. |
| `GET` | `/api/admin/occupancy` | — | Live count, who is inside, recent visits. |
| `POST` | `/api/admin/occupancy` | `{ memberId, action }` | Check a member in or out at the desk. |
| `GET` | `/api/admin/access` | — | Access anomaly alarms (>1 event / 7 days) and recent events. |

### Trainer (require a staff-trainer or legacy trainer session)

| Method | Path | Body | Purpose |
|---|---|---|---|
| `POST` | `/api/trainer/auth` | `{ email?, password }` | With `email`, logs in a staff trainer account and sets the staff cookie. Without `email`, uses the legacy `TRAINER_PASSWORD` and legacy trainer cookie. Rate-limited per IP and email. |
| `POST` | `/api/trainer/logout` | — | Clears both trainer and staff cookies. |
| `GET` | `/api/trainer/me` | — | Session + role + permissions (legacy shared login included). |
| `GET` | `/api/trainer/members` | `?id=` optional | Requires `members_view`. Member list, or one member with plans and visits. |
| `GET` | `/api/trainer/occupancy` | — | Requires `occupancy_view`. Live count, who is inside, recent visits. |
| `POST` | `/api/trainer/occupancy` | `{ memberId, action }` | Requires `occupancy_manage`. Check a member in or out. |
| `GET` | `/api/trainer/config` | — | Requires `announcements_manage` or `schedule_manage`. |
| `POST` | `/api/trainer/config` | `{ announcements?, schedule? }` | Saves only the slice(s) the trainer is allowed to edit. |

---

## The AI Subsystem

The AI chat endpoint (`src/app/api/ai-agent/chat/route.ts`) runs a strict, cost-aware
pipeline:

1. **Rate limit** — in-memory per-IP bucket; over-limit requests get `429` + `Retry-After`.
2. **Safety harness pre-flight** (`aiSafetyHarness.ts`, **zero token cost**):
   - **Persona lock / out-of-scope blocker** — rejects coding, homework and jailbreak
     attempts with a canned in-scope refusal.
   - **Medical & steroid red-flag filter** — returns a safety warning and advises
     consulting a doctor/physiotherapist instead of calling the model.
   - Flags whether the query needs **web search** (scientific/supplement topics) and
     matches relevant local exercises.
3. **Gemini call** — if `GEMINI_API_KEY` is set, a single request to the model named
   by `GEMINI_MODEL` (default `gemini-2.0-flash-lite`) with the safety system prompt,
   optionally with **Google Search grounding** enabled.
4. **Local deterministic fallback** — if there is no key, the call fails, or it returns
   nothing usable, `aiAgentChat.ts` answers locally (injury substitutions, alternatives,
   nutrition, sets/reps). This is what powers the fully offline Lite Mode.

**Plan generation is separate and always local** — `aiWorkoutEngine.ts` is pure,
deterministic TypeScript with no network dependency. It picks a split from
`daysPerWeek` (3 → full body, 4 → upper/lower, 5+ → push/pull/legs), adjusts sets, reps,
RPE and rest by goal (strength / hypertrophy / fat loss / endurance), excludes exercises
whose `injuryRisks` intersect the user's injuries, and builds warm-up and cardio
recommendations. This is why plans work instantly and offline.

---

## White-label Configuration

`src/config/gymConfig.ts` exports `defaultGymConfig` — the single object describing the
gym: name, legal name, tagline, address, working hours, socials, stats, facilities,
class schedule, trainers and pricing plans. Its shape is the `GymConfig` type in
`src/types/index.ts`.

- The public site reads it through `useGymConfig()`, which fetches `/api/config`
  **once per page session** (a module-level shared promise) and renders the static
  default until the server copy arrives.
- Admins edit slices of it in the admin **Pricing / Schedule / Info** tabs; the merged
  object is persisted to the `site_config` table and served by `/api/config`.

To re-brand for another gym you change the seeded config (via admin, or by editing
`defaultGymConfig` for a fresh install) — no component changes required.

---

## Multi-tenancy (many gyms, one deployment)

One Next.js process can serve many independent gyms. Each gym is a **tenant** with
its own database file, its own admin credentials and its own gym config; the
process resolves the tenant from the request's `Host` header.

**How a request is routed**

1. The host is normalised (`port` stripped, lower-cased) and looked up in the
   tenant registry, which is cached in memory for 10 seconds.
2. The matching tenant id is passed to `getRepository(tenantId)`, which is bound
   to that tenant's database — a repository instance cannot reach another gym's
   data.
3. **Unmatched hosts fall back to the `default` tenant**, so `localhost`, an IP
   address or your existing single-gym domain keep working with no configuration.

> Tenant resolution happens in the Node runtime (route handlers), **not** in the
> Next proxy. The proxy only performs the cheap same-origin/CSRF check; keeping
> tenant lookup and SQLite access in route handlers avoids coupling the global
> request path to the data layer.

**The tenant registry** lives in its own SQLite database at `data/registry.db`
(`tenants` table: `id`, `name`, `domains`, `admin_password_hash`,
`trainer_password_hash`, `created_at`). A `default` tenant is seeded
automatically on first use from the existing `ADMIN_PASSWORD` (and optional
`TRAINER_PASSWORD`) variables, so an upgrade from single-tenant needs no manual
step.

**Provisioning a gym**

```bash
# id, display name, domain(s), admin password, optional trainer password
npm run tenant:create -- iron "Iron Gym" iron.example.com 'S3cret!' 'TrainerS3cret!'

# Set or rotate either password later
npm run tenant:password -- iron trainer 'NewTrainerS3cret!'
```

Its database (`data/tenants/iron.db`) is created and seeded with the default gym
config on the first request. Removing a gym means deleting its database file and
its registry row.

**Multiple admins:** each tenant has its own staff table and its own data. Named
admin and trainer accounts are stored per tenant, their sessions are bound to
`tenantId + account + password hash`, and the legacy admin token is derived from
`tenantId + adminPasswordHash`. A cookie issued on gym A is rejected on gym B.
This supports many gyms and many named admins/trainers per gym in one deployment.
The legacy `ADMIN_PASSWORD` remains an owner/recovery credential and is not shown
in the staff list.

**A chain of gyms (2–3 locations, same brand):** create one tenant per domain
(`thessaloniki.example`, `athens.example`, …) with the same `gymName`, but its own
address, coordinates, staff, members and occupancy. This works today and keeps
each location's data isolated. A **shared member/chain identity** (one member can
enter all locations with the same QR) is a separate feature: it needs a tenant
group/shared member registry, because QR tokens and member sessions are
tenant-bound by design. Decide first whether the locations are independent
franchises or one chain with cross-location access.

**Data layout**

```
data/
├── registry.db          # tenant registry (which gym owns which domain)
├── nexusfit.db          # the default tenant (kept at the original path)
└── tenants/
    ├── iron.db          # one database per additional gym
    └── ...
```

**Adding a gym is a three-step operation:** create the tenant, point its DNS at
this host, and add its domain to the reverse proxy's TLS configuration. Gyms on
**different apex domains each need their own certificate** (Caddy issues them
automatically for domains listed in its site block); gyms on subdomains of one
domain can share a wildcard certificate.

**Operational notes**

- Backups must cover the whole data directory — `deploy/backup-db.sh` and the
  compose backup sidecar archive `data/` (registry + every tenant database).
- Lead retention (`/api/cron/retention`) runs against **every** tenant.
- Rate limits are keyed by `tenantId + IP`, so one gym cannot consume another
  gym's allowance.

**Known limitations:** the audit log is append-only in each tenant's SQLite
database (no external SIEM export), and IP addresses come from the request
headers — configure trusted proxy headers before relying on them for forensics.
For a large number of gyms or multiple app instances, move the repository from
per-tenant SQLite to Postgres; the `Repository` seam is already in place.

---

## Offline / Lite Mode

`useNetworkStatus()` combines the Network Information API, the `Save-Data` header and a
manual toggle. When the connection is 2G / slow-3G / offline (or the user opts in),
`app/page.tsx` swaps the dashboard for `GymFloorLiteMode`: a barebones gym-floor view
with an offline AI coach and an exercise checklist that makes **zero network requests**.

---

## Security

- **No SQL injection surface** — every query is a prepared statement with bound
  parameters.
- **Admin auth** — the legacy `ADMIN_PASSWORD` still derives a SHA-256 cookie; named
  staff admins use a signed, DB-checked staff cookie. Deleting/deactivating an
  account or changing its password invalidates the session immediately.
- **Member auth** — scrypt-hashed PINs, `timingSafeEqual` comparison, and an **HMAC-SHA256 signed, tenant-bound** session cookie (HttpOnly, `Secure` in production) that cannot be forged from a guessable member id or replayed against another gym. The cookie carries a random session id and absolute expiry; every member API checks `member_sessions` in the tenant database, so logout, per-device revocation, logout-all, PIN changes, member deletion and idle/absolute expiry take effect immediately.
- **Member session lifecycle** — default idle timeout 7 days, absolute lifetime 30 days (both configurable by env), at most 10 active sessions per member (oldest revoked first), `last_seen_at` written at most once per minute, and expired/revoked rows purged by the retention cron. Login/logout/revocation/idle-expiry events are audited. The member profile menu exposes all-device logout and the portal lists active devices with individual revoke buttons.
- **Staff permissions** — enforced server-side in `trainerRoute()`; UI tab hiding
  is only cosmetic. Permission changes apply on the next request without re-login.
- **Access control** — rotating HMAC-signed QR tokens (90 s), device-key
  authentication, explicit entry/exit direction, DB-enforced anti-passback,
  duplicate/quick-re-entry tracking, a weekly admin alarm and audit logging of
  denied scans. The device key and token are never accepted through cookies.
- **Audit trail** — staff/admin logins, all staff-side writes and member session
  events (login, logout, logout-all, per-device revoke, idle expiry and
  oldest-session eviction) are appended to a tenant-scoped `audit_log` with
  actor, action, entity, details, IP and time. It is admin-only, retained 12
  months, and staff deletion anonymizes the actor fields.
- **Rate limiting** on the AI endpoint, member login (per IP and per member
  code), admin/trainer login (per IP and email) and lead submissions.
- **No known-credential accounts in production** — demo members (`NX-8492` / PIN
  `1234`) and the `admin1` admin fallback are seeded only outside production and
  only for the default tenant, unless `DEMO_MODE=1` (or, for the members alone,
  `SEED_DEMO_MEMBERS=1`) is set explicitly for a demo instance.
- **Security headers** set globally in `next.config.ts`: HSTS (2 years, preload),
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: origin-when-cross-origin`, a `Permissions-Policy` that disables
  camera, microphone and geolocation, plus COOP, CORP,
  `X-Permitted-Cross-Domain-Policies: none`, `X-DNS-Prefetch-Control: off` and an
  enforced partial CSP (`base-uri 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`, `object-src 'none'`). A nonce-based `script-src` CSP
  remains a follow-up because Next injects inline RSC/bootstrap scripts.
- **CSRF defense-in-depth** — `SameSite=Lax` cookies plus `src/proxy.ts`, which
  rejects mutating `/api/*` requests when the browser `Origin` host does not match
  the request `Host`. `Host` is authoritative because it is the authority the server
  received; `x-forwarded-host` is only a fallback when `Host` is absent, so a proxy
  that rewrites `Host` must preserve the original one (Caddy does by default).
  Requests without `Origin` (access scanner, cron, server-to-server) pass through
  and rely on their own credentials.
- **Cookie hardening** — production session cookies use the `__Host-` prefix
  (`__Host-nexusfit_member_id`, `__Host-nexusfit_admin`,
  `__Host-nexusfit_trainer`, `__Host-nexusfit_staff`), which requires HTTPS,
  `Secure`, `Path=/` and no `Domain`, and prevents a sibling subdomain from
  overwriting them. Development/test keep the plain names so localhost works.
- **Supply-chain / CI** — GitHub Actions run dependency review, production
  `npm audit`, CycloneDX SBOM generation, Gitleaks, Semgrep, CodeQL and Trivy;
  Dependabot proposes weekly npm and Actions updates. See
  [`SECURITY.md`](./SECURITY.md), [`docs/security/`](./docs/security/README.md)
  and [`.github/workflows/security.yml`](./.github/workflows/security.yml).
  Local equivalents: `npm run audit:prod` and `npm run sbom`.
- **Startup security warnings** (`instrumentation.ts`) flag a missing or short
  `SESSION_SECRET`/`ADMIN_PASSWORD`/`TRAINER_PASSWORD`/`CRON_SECRET` and an
  accidental demo mode.
- **Backups are written `0600`** (database snapshots contain member data, PIN
  hashes and staff password hashes).
- **`poweredByHeader: false`** and **`console.*` stripped in production**.

**Privacy & cookies**
- Essential cookies: `nexusfit_member_id` (30 days) and `nexusfit_admin` /
  `nexusfit_trainer` / `nexusfit_staff` (8 hours), all HttpOnly + SameSite=Lax +
  Secure in production. In production the names carry the `__Host-` prefix (for
  example `__Host-nexusfit_member_id`); development/test use the plain names.
- Server-side member session records: a SHA-256 hash of the session id, created /
  last-seen / expiry timestamps, IP and user agent, used only for authentication,
  revocation and security review. The raw session id is never stored; expired and
  revoked rows are purged by the retention job.
- Consent-gated local storage: UTM parameters, saved plans and weight logs.
  Theme/lite-mode preferences, the consent record and the member UI cache are
  functional storage disclosed in the privacy policy.
- The privacy policy defaults (sections 3, 5, 7, 8, 9, 10, 11 and 12) cover
  cookies, staff accounts, retention, deletion, the audit log, the always-loaded
  map and access-anomaly tracking. Existing saved configs receive the current
  mandatory cookie/retention/security sections plus any newly added sections.
- Member self-service export/erase; admin member delete and staff account delete
  are full erasure paths. `CONSENT_VERSION` is bumped to re-prompt after material
  policy changes.
- Audit history keeps action records for security/accountability for 12 months,
  including member login/logout/session-revocation events; a deleted staff
  account's actor name/email/id are anonymized. The privacy policy includes an
  explicit audit-log section (section 10).

---

## Testing

Vitest runs in a Node environment with the `@` → `src` alias. Every database test
points `SQLITE_DATA_DIR` at its own `mkdtemp` directory, so suites are isolated and
safe to run in parallel.

```bash
npm test                          # full suite
npx vitest run src/lib/session.test.ts   # one file
npm run check:docs                # docs-vs-code drift check
```

CI runs `audit`, `lint`, `typecheck`, `test`, `demo:build`, `check:docs` and `build`
on every push and pull request via Gitea/Forgejo Actions — see `docs/CI.md` for the
runner setup. GitHub Actions additionally builds and deploys the static demo to Pages
on every push to `main` (`.github/workflows/pages.yml`).

**Security & session**

| Test file | Coverage |
|---|---|
| `src/lib/session.test.ts` | HMAC signing/verification for member, legacy trainer and staff cookies; tamper and cross-tenant rejection. |
| `src/lib/memberSessions.test.ts` | Server-side sessions: the raw session id is never stored, idle/absolute expiry, revocation. |
| `src/lib/sameOrigin.test.ts` | CSRF proxy helper: mutating-method detection, `Host`-first trusted host with an `x-forwarded-host` fallback, spoofed `x-forwarded-host` rejected, `Origin: null` and malformed origins rejected. |
| `src/lib/geminiModel.test.ts` | `GEMINI_MODEL` resolution: default on unset/blank, well-formed ids accepted, path-escaping values rejected, env read, endpoint construction. |
| `src/lib/passwordHash.test.ts` | scrypt hash/verify round-trip and `timingSafeEqual` comparison. |
| `src/lib/rateLimit.test.ts` | Fixed-window limiter behaviour and `getClientIp()` header precedence. |
| `src/lib/staffPermissions.test.ts` | Permission keys, defaults, normalisation and role checks. |
| `src/lib/accessToken.test.ts` | Rotating QR access tokens: signing, expiry and tamper rejection. |
| `src/lib/aiSafetyHarness.test.ts` | Medical/out-of-scope guardrails, including accented Greek spellings that the rule patterns must still match. |
| `src/lib/consent.test.ts` | Cookie-consent record persistence and versioning. |

**Data layer & tenancy**

| Test file | Coverage |
|---|---|
| `src/lib/sqliteDb.test.ts` | Uses an isolated temp `SQLITE_DATA_DIR`; covers seeding, member PIN auth, invalid-PIN rejection, plan persistence/round-trip, invalid payloads, admin member listing (asserts `pin_code` never leaks), member upsert/delete, lead create + status update, gym-config get/update. Cleans up in `afterAll`. |
| `src/lib/db/connection.test.ts` | `getDataDir()` resolution, connection caching and the on-disk file layout. |
| `src/lib/db/queries.test.ts` | Characterization tests for the per-entity query modules: ordering, limit clamping, joins and cutoff semantics. |
| `src/lib/db/sqliteRepository.test.ts` | The `Repository` boundary: the SQLite adapter honours the async interface. |
| `src/lib/tenants.test.ts` | Tenant registry, default-tenant admin seeding and cross-tenant data isolation. |
| `src/lib/subscription.test.ts` | Subscription/tier gating for premium features. |

**Domain logic**

| Test file | Coverage |
|---|---|
| `src/lib/aiWorkoutEngine.test.ts` | Exact day count (3/4/5/6), split per frequency, day renumbering for cycled 5–6 day splits, 4-vs-3 sets by session length, goal-driven reps/rest, shoulder-injury exercise exclusion. |
| `src/lib/aiAgentChat.test.ts` | Offline chat engine: injury, exercise and nutrition branches. |
| `src/lib/occupancyAnalytics.test.ts` | Weekday/hour bucketing, averages and quietest/busiest hour selection. |
| `src/lib/barcode.test.ts` | Barcode value normalisation. |
| `src/lib/maps.test.ts` | Directions URL construction per platform. |
| `src/lib/storage.test.ts` | localStorage helpers and their consent gating. |
| `src/lib/auth.test.ts` | Client member-session storage and plan-history writes (including the quota/private-mode failure path). |

**API & client**

| Test file | Coverage |
|---|---|
| `src/lib/api.test.ts` | `adminRoute` guard: rejects missing/tampered cookies (`401`), passes authenticated requests, wraps handler throws into a `500` envelope; tenant isolation. |
| `src/lib/demoMockApi.test.ts` | Demo mock API: config, demo login, plan persistence across logins, export attachment, erasure, lead submissions. |
| `src/lib/demoApp.test.tsx` | The React demo shell end-to-end against the mock API (jsdom). |

### Docs drift check

`npm run check:docs` (`scripts/check-docs-drift.mjs`) compares the documentation
against the code:

- **hard** — a documented env var that nothing reads, a documented npm script that
  does not exist, an npm script the README never mentions, a broken relative link,
  or a variable in `deploy/.env.production.example` missing from the env table;
- **soft** — code that exists but the docs have not caught up with yet (an
  undocumented env var, `src/lib` module, test file, route method or table).

Soft findings are reported but do not fail the run; `--strict` turns them into
failures. Run it after touching env vars, scripts, routes or the schema.

---

## Deployment

Three supported paths, all detailed in `deploy/DEPLOYMENT_GUIDE.md`.

**Docker Compose (recommended for a VPS)** — `deploy/docker-compose.yml` brings up
four services:

- `nexusfit_app` — the app built from `deploy/Dockerfile` (multi-stage `node:22-alpine`,
  runs as a non-root user, executes the standalone `server.js`), bound to
  `127.0.0.1:3000` with the SQLite file on the named volume `nexusfit_data`.
  It has a `/api/health` healthcheck and capped Docker logs.
- `caddy` — TLS termination, compression and reverse proxy on ports 80/443
  (`deploy/Caddyfile`).
- `db_backup` — a `node:22-alpine` sidecar that writes a **consistent** snapshot
  (`VACUUM INTO`) of every database daily and keeps 14 days.
- `retention_cron` — calls the GDPR retention endpoint daily.

Required secrets are enforced by compose; copy `deploy/.env.production.example`
to `deploy/.env` and fill it in. `.dockerignore` keeps local databases and
`.env` files out of the image.

```bash
cp deploy/.env.production.example deploy/.env   # fill in the values
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f nexusfit_app
```

Step-by-step Hetzner notes (DNS, firewall, updates, restore) are in
[`deploy/HETZNER.md`](./deploy/HETZNER.md).

**PM2 (bare-metal)** — `deploy/ecosystem.config.js` runs `next start` in cluster mode
across all cores.

**Read-only filesystems / Vercel** — because the app writes SQLite to disk, point
`SQLITE_DATA_DIR` at a writable path (e.g. `/tmp`) when the filesystem is read-only.
Note that such paths are ephemeral — this is suitable for testing, not durable hosting.

A Vercel deployment is a **smoke test only**: serverless instances are ephemeral and
do not share `/tmp`, so data written by one request may be invisible to the next.

1. Import the repository in Vercel (framework is auto-detected as Next.js; `engines.node`
   pins Node 22, which is required for the built-in `node:sqlite`).
2. **Demo instance:** add a single variable, `DEMO_MODE=1`, scoped to Production
   *and* Preview. It seeds the demo members, sets the admin password to `admin1`
   and signs member sessions with a known demo secret, so nothing else is needed.
3. **Real instance instead:** set `ADMIN_PASSWORD`, `SESSION_SECRET` (at least 16
   chars), `SQLITE_DATA_DIR=/tmp/nexusfit`, and optionally `GEMINI_API_KEY` and
   `NEXT_PUBLIC_SITE_URL`. Do **not** set `DEMO_MODE`.
4. Environment variables are only read by a new deployment: after changing them,
   redeploy (`Deployments → ⋯ → Redeploy`) or push a commit.
5. Open `/admin` with the admin password (or a staff account you create), and the
   member portal with `NX-8492` / `1234` on a demo instance. If the logs still
   contain `ADMIN_PASSWORD is not set` or `Demo members were not seeded`, the
   variables did not reach that deployment.
6. Staff accounts live in the tenant SQLite database, so on Vercel they are lost
   on a cold start like all other data. Create them again for a smoke test; use
   durable hosting for real staff accounts.

For durable data, use Docker Compose (below) or swap the `Repository` implementation
for Postgres (see [Known Gaps](#known-gaps--roadmap)).

`.next/standalone/` plus `npm run serve:prod` embed only the files the server needs,
so no `node_modules` install is required at runtime.

**GitHub Pages (interactive demo)** — `.github/workflows/pages.yml` builds `site/`
with Vite and deploys it to
[evangelosmoschou.github.io/NexusFit](https://evangelosmoschou.github.io/NexusFit/).
The demo answers every `/api/*` request in the browser via `site/src/mockApi.ts` and
persists data in `localStorage`; it deliberately has no server-side functionality.

---

## Known Gaps & Roadmap

- **One database per tenant** — isolation comes from separate SQLite files rather
  than a shared schema with row-level security. Simple and safe, but it does not
  support cross-gym reporting; a shared Postgres schema with RLS would be the
  path for that.
- **One-time synchronous hashing** — login verification and member creation use
  async `scrypt`; the initial demo/tenant seed and the legacy-PIN migration still
  hash synchronously because they run before requests are served.
- **In-memory rate limiting** — resets on restart and is per-process, so it does
  not hold under a PM2 cluster or multiple containers. The Docker setup is
  single-instance by design.
- **Theme preview control** — visible by default while a theme is being chosen;
  the Docker build hides it unless built with `NEXT_PUBLIC_THEME_PREVIEW=1`.
- **CSP is partial** — `base-uri`, `form-action`, `frame-ancestors` and
  `object-src` are enforced; a full nonce-based `script-src` policy is still
  pending because Next injects inline RSC/bootstrap scripts.
- **No MFA yet** — admin/staff authentication is password-only. MFA/WebAuthn is
  deliberately deferred; no fake or placeholder second factor is shipped. The
  existing controls are scrypt hashes, per-IP/email rate limits, short-lived
  sessions, DB-checked staff accounts and immediate session invalidation on
  delete/deactivate/password change.
- **TLS per gym is manual** — a new gym's domain must be added to the reverse
  proxy configuration (Caddy issues the certificate automatically once listed).
- **Local plan storage is per-device** — a member's plans live in `localStorage` and are
  only mirrored server-side when logged in; a new device starts empty until logged in.

---

## License

Released under the **GNU Affero General Public License v3.0** — see
[LICENSE](./LICENSE). In short: you may use, modify and self-host the code, but if
you run a modified version as a network service you must offer its source to the
users of that service (AGPL §13).

A **commercial license** is available for organisations that need to use or host a
modified version without the AGPL's source-disclosure obligations — contact the
maintainer through the repository's issue tracker.

The AGPL covers the source code only. The "NexusFit" / "Nexus Athletics" names,
branding, marketing copy and sample gym content are **not** licensed; re-brand and
replace the sample content before deploying publicly. See [NOTICE](./NOTICE).

---

## Reference

- `docs/MONITORING.md` — uptime probes, log rotation, backup strategy.
- `docs/CI.md` — CI pipeline and Gitea/Forgejo runner setup.
- `docs/50_RULES_WEBSITE_CHECKLIST.txt` — the design/quality checklist this project follows.

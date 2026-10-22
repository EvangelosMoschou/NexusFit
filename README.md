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

## Table of Contents

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
- **Manual Workout Builder** for members who want to hand-craft a plan.
- **AI Coach chat modal** for questions about exercises, substitutions, sets/reps
  and nutrition.
- Per-exercise **weight logger** with progressive-overload history.
- Print/PDF export and copy-to-clipboard of any plan.

**Admin console** (`/admin`, password-gated, 5 tabs)
- **Leads** — list inquiries and move them through `pending → contacted → registered`.
- **Members** — create/update/delete members and toggle their AI-pass tier.
- **Pricing / Schedule / Info** — each edits one slice of the live gym config, which
  immediately propagates to the public site.

**Resilience**
- Deterministic **local AI fallback** — the coach still answers with zero network and
  zero token cost.
- **Lite Mode** — an ultra-light, zero-bandwidth gym-floor view that auto-engages on
  2G / slow-3G / offline connections (or via a manual toggle).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 15.1.7** (App Router, React Server Components, `output: "standalone"`) |
| UI | **React 19**, **TailwindCSS 3.4**, **lucide-react** icons |
| Language | **TypeScript 5** (strict) |
| Database | **`node:sqlite`** (`DatabaseSync`) — Node's built-in SQLite, no external driver |
| AI | **Google Gemini** (`gemini-2.0-flash-lite`) with a local deterministic fallback |
| Testing | **Vitest 5** (Node environment) |
| Demo | **Vite 8** static build with an in-browser mock API (GitHub Pages) |
| Lint | ESLint 9 + `eslint-config-next` |
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
├── package.json                  Scripts & the four runtime deps
├── next.config.ts                Standalone output, security headers, lucide tree-shaking
├── tailwind.config.ts            "Soft Slate & Graphite" theme, sky-cyan accent
├── vitest.config.ts              Node env, "@" → src alias
├── tsconfig.json
│
├── data/                         SQLite database lives here (gitignored)
│   └── nexusfit.db
│
├── public/
│   ├── manifest.webmanifest      PWA manifest
│   └── icons/icon.svg
│
├── deploy/                       Production assets (see Deployment)
│   ├── Dockerfile                Multi-stage node:22-alpine → standalone runner
│   ├── docker-compose.yml        app + Caddy TLS + daily db-backup sidecar
│   ├── Caddyfile                 TLS reverse proxy
│   ├── ecosystem.config.js       PM2 cluster config
│   ├── backup-db.sh
│   ├── start.sh
│   ├── .env.production.example
│   ├── DEPLOYMENT_GUIDE.md
│   └── PROJECT_FILES_CHECKLIST.txt
│
├── docs/
│   ├── README.md                 Docs index
│   ├── CI.md                     Gitea/Forgejo Actions pipeline + runner setup
│   ├── MONITORING.md             Uptime / 401-probe / log rotation / backups
│   └── 50_RULES_WEBSITE_CHECKLIST.txt  30 anti-patterns + 20 essential features
│
├── scripts/
│   └── create-tenant.mjs         Tenant provisioning CLI (npm run tenant:create)
│
├── site/                         Static interactive demo (Vite → GitHub Pages)
│   ├── src/                      Demo shell, in-browser mock API, test
│   ├── vite.config.mts
│   └── index.html
│
├── .github/workflows/pages.yml   Builds the demo and deploys it to GitHub Pages
│
└── src/
    ├── app/
    │   ├── layout.tsx            Root layout, Greek metadata, PWA link, dark theme
    │   ├── page.tsx              Client entry: landing ⇄ portal ⇄ lite mode
    │   ├── admin/page.tsx        Admin console (login + 5 tabs)
    │   ├── not-found.tsx         404
    │   ├── globals.css
    │   └── api/**/route.ts       REST handlers (see API Reference)
    │
    ├── components/
    │   ├── Navbar Hero Facilities Timetable Pricing FAQ LeadBooking
    │   ├── Footer CookieBanner LegalModal SearchModal
    │   ├── ScrollTopButton ScrollProgressBar FloatingContact PWAInstallPrompt
    │   ├── WeightLoggerInput.tsx
    │   ├── admin/      LeadsTab · MembersTab · PricingTab · ScheduleTab · InfoTab
    │   ├── ai/         WorkoutWizard · WorkoutDisplay · AICoachChatModal
    │   ├── auth/       LoginModal
    │   ├── dashboard/  MemberPortalPage · GymFloorLiteMode
    │   └── workout/    ManualWorkoutBuilderModal
    │
    ├── config/gymConfig.ts       defaultGymConfig — the white-label source of truth
    ├── data/exercisesData.ts     23 exercises (GR/EN names, muscle group, injury risks)
    ├── lib/                      Business logic & data access (see below)
    └── types/
        ├── index.ts              All shared TypeScript types
        └── sqlite.d.ts           Module declaration for node:sqlite
```

**`src/lib/` at a glance**

| File | Responsibility |
|---|---|
| `sqliteDb.ts` | All data access: schema creation, seeding, PIN migration, member/plan/lead/config CRUD, input validation. Each function takes a `tenantId` (defaults to the default tenant). |
| `db/` | The storage seam: `repository.ts` (async `Repository` interface), `sqliteRepository.ts` (per-tenant SQLite implementation), `index.ts` (`getRepository(tenantId)`), `types.ts`. Swapping to Postgres means one new implementation here. |
| `tenants.ts` | Tenant registry (`data/registry.db`), host → tenant resolution with caching, tenant creation. |
| `aiWorkoutEngine.ts` | Deterministic plan generator: split-by-frequency, goal-driven sets/reps/RPE/rest, injury-safe exercise selection. |
| `aiAgentChat.ts` | Zero-cost local chat engine (injury/alternative/nutrition/sets-reps intents). |
| `aiSafetyHarness.ts` | Pre-flight persona-lock, out-of-scope & medical/steroid red-flag filters, trusted-domain list, system-prompt builder. |
| `api.ts` | `adminRoute()` — tenant-aware auth guard + consistent error envelope for admin handlers. |
| `session.ts` | HMAC-SHA256 signing/verification of member session cookies (`SESSION_SECRET`). |
| `adminAuth.ts` | SHA-256 admin session cookie (`ADMIN_PASSWORD`-derived). |
| `cookies.ts` | Cookie names and `Secure` flag policy shared by auth routes. |
| `consent.ts` | Cookie-consent preferences persisted on the client. |
| `apiClient.ts` | Browser fetch wrapper that normalises the `{ success, error, message }` envelope. |
| `format.ts` | Small shared formatting helpers. |
| `useEscapeKey.ts` | Escape-key dismissal hook used by modals. |
| `passwordHash.ts` | scrypt hash/verify with `timingSafeEqual`. |
| `rateLimit.ts` | In-memory fixed-window rate limiter + `getClientIp()`. |
| `auth.ts` | Client member session model (localStorage + cookie). |
| `storage.ts` | Client localStorage: saved plans and progressive-overload exercise logs. |
| `useGymConfig.ts` | Fetches `/api/config` once per session, falls back to `defaultGymConfig`. |
| `useNetworkStatus.ts` | Connection quality + manual Lite Mode toggle. |
| `useLocalAgentChat.ts` | Shared offline chat hook used by the chat modal and lite mode. |
| `useUTM.ts` | Captures UTM params into `sessionStorage`. |

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
known PINs):

| Member code | PIN | Tier |
|---|---|---|
| `NX-8492` | `1234` | All-Access **+ AI Copilot** |
| `NX-3109` | `1234` | Standard (no AI access) |

The admin panel lives at `/admin` and requires the `ADMIN_PASSWORD` environment
variable to be set — without it, admin login returns `503`.

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
| `npm run format` / `format:check` | Prettier write / check |
| `npm run tenant:create -- <id> <name> <domain> <password>` | Provision a tenant (see [Multi-tenancy](#multi-tenancy-many-gyms-one-deployment)) |
| `npm run demo:dev` / `demo:build` | Vite interactive demo (dev server / static build in `site/dist`) |
| `npm run docker:build` / `docker:up` / `docker:down` | Docker workflow (see [Deployment](#deployment)) |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | No | — | Google AI Studio key. When absent, the AI chat uses the local engine. |
| `GEMINI_MODEL` | No | `gemini-2.0-flash-lite` | Documented in the env example; **currently the route hardcodes the model** (see Known Gaps). |
| `ADMIN_PASSWORD` | For admin | — | Seeds the **default tenant's** admin password in the registry on first run. Additional tenants get their own password via `npm run tenant:create`. |
| `SESSION_SECRET` | Production | — | HMAC key used to sign member session cookies. Member login returns `503` in production if unset or shorter than 16 characters. Generate with `openssl rand -hex 32`. |
| `CRON_SECRET` | For retention | — | Shared secret required by `POST /api/cron/retention`. The route returns `503` if unset. |
| `SQLITE_DATA_DIR` | No | `<cwd>/data` | Directory for `nexusfit.db`. Useful on read-only filesystems (e.g. Vercel → `/tmp`). |
| `NEXT_PUBLIC_SITE_URL` | No | — | Canonical site URL used for SEO metadata. |
| `PORT` / `HOSTNAME` | No | `3000` / — | Standalone/Docker server binding. |
| `SITE_DOMAIN` | Docker only | `localhost` | Domain Caddy uses for TLS in `docker-compose.yml`. |

---

## Data Layer (SQLite)

Access is centralised in `src/lib/sqliteDb.ts` behind a **lazy singleton**
(`getDatabase()`), which creates the data directory, opens `nexusfit.db`, creates the
schema and seeds defaults on first use.

**Schema**

| Table | Key columns | Notes |
|---|---|---|
| `members` | `id`, `member_code` (unique), `email` (unique), `pin_code`, `tier_name`, `has_ai_access`, `subscription_status`, `expires_at`, `created_at` | `pin_code` stores an `scrypt:…` hash. |
| `workout_plans` | `id`, `member_id` (FK → members, `ON DELETE CASCADE`), `split_name`, `split_type`, `days_per_week`, `session_duration`, `plan_json`, `created_at` | `plan_json` is the full `GeneratedWorkoutPlan`. |
| `lead_inquiries` | `id`, `full_name`, `email`, `phone`, `goal`, `preferred_plan`, `notes`, `status`, `created_at` | `status`: `pending` / `contacted` / `registered`. |
| `site_config` | `key` (PK), `value`, `updated_at` | The white-label config, stored under key `gym_config`. |

**Guarantees**
- **PIN hashing** — `passwordHash.ts` uses `scrypt` with a per-hash salt and compares
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
wrapped by `adminRoute()`, which returns `401 { success: false, error: "Unauthorized" }`
when the `nexusfit_admin` cookie is missing or invalid, and `500` with a standard error
message if the handler throws.

### Public

| Method | Path | Body / Notes | Responses |
|---|---|---|---|
| `GET` | `/api/health` | Uptime probe (`force-dynamic`). | `200 { success, ok, uptime, timestamp }` |
| `GET` | `/api/config` | Admin-editable gym config for the public site. | `200 { success, config }` |
| `POST` | `/api/leads` | `{ fullName, email, phone?, goal?, preferredPlan?, notes? }`. | `200 { success }`, `400` missing name/email |
| `POST` | `/api/auth/member` | `{ identifier, pin }` (member code **or** email + PIN). Sets the **HMAC-signed** `nexusfit_member_id` cookie (HttpOnly, `Secure` in prod, `SameSite=Lax`, 30 days). | `200 { success, member }`, `400`, `401`, `503` (no `SESSION_SECRET`), `500` |
| `POST` | `/api/auth/logout` | Clears the member session cookie (`Max-Age=0`). | `200 { success }` |
| `POST` | `/api/member/workouts` | `{ plan }`. Requires the `nexusfit_member_id` cookie. | `200 { success }`, `400` missing plan, `401` not authenticated |
| `GET` | `/api/member/export` | GDPR access/portability: downloads the signed-in member's data + plans as JSON (`Content-Disposition: attachment`). Requires the member cookie. | `200` file, `401`, `404` |
| `DELETE` | `/api/member/erase` | GDPR erasure: deletes the signed-in member, their plans (cascade) and any lead inquiries sharing their email, then clears the cookie. | `200 { success }`, `401` |
| `POST` | `/api/cron/retention` | Deletes lead inquiries older than 12 months. Requires the `x-cron-secret` header. | `200 { success, removed }`, `401`, `503` (no `CRON_SECRET`) |
| `POST` | `/api/ai-agent/chat` | `{ query }`. Rate-limited per IP. | `200 { id, sender, text, timestamp, … }`, `400`, `429` (with `Retry-After`), `500` |

### Admin (require the admin session cookie)

| Method | Path | Body | Purpose |
|---|---|---|---|
| `POST` | `/api/admin/auth` | `{ password }` | Login; sets the `nexusfit_admin` cookie (8 h, `Secure` in prod). `503` if `ADMIN_PASSWORD` unset, `401` if wrong. |
| `POST` | `/api/admin/logout` | — | Clears the admin session cookie. |
| `GET` | `/api/admin/config` | — | Read the saved gym config. |
| `POST` | `/api/admin/config` | `{ config }` | Merge-and-save gym config. `400` if body missing. |
| `GET` | `/api/admin/leads` | — | List all leads. |
| `DELETE` | `/api/admin/leads` | `?id=` | Delete a lead inquiry (GDPR erasure). |
| `POST` | `/api/admin/leads` | `{ … }` | Update a lead's status. |
| `GET` | `/api/admin/members` | — | List members (**never** includes `pin_code`). |
| `POST` | `/api/admin/members` | member fields | Create or update a member (upsert on `member_code`). |
| `DELETE` | `/api/admin/members` | `?id=` | Delete a member. |

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
3. **Gemini call** — if `GEMINI_API_KEY` is set, a single request to `gemini-2.0-flash-lite`
   with the safety system prompt, optionally with **Google Search grounding** enabled.
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

> Tenant resolution happens in the Node runtime (route handlers), **not** in Next
> middleware, because middleware runs on the Edge runtime where `node:sqlite` is
> unavailable.

**The tenant registry** lives in its own SQLite database at `data/registry.db`
(`tenants` table: `id`, `name`, `domains`, `admin_password_hash`, `created_at`).
A `default` tenant is seeded automatically on first use from the existing
`ADMIN_PASSWORD` variable, so an upgrade from single-tenant needs no manual step.

**Provisioning a gym**

```bash
# id, display name, domain(s), admin password
npm run tenant:create -- iron "Iron Gym" iron.example.com 'S3cret!'
```

Its database (`data/tenants/iron.db`) is created and seeded with the default gym
config on the first request. Removing a gym means deleting its database file and
its registry row.

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

**Known limitation (still open):** PIN and admin-password hashing still uses the
synchronous `scryptSync`. In a shared process a burst of logins for one gym
briefly blocks the event loop for the others. Moving to async `scrypt` behind the
already-async `Repository` boundary is the remaining task.

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
- **Admin auth** — `adminAuth.ts` derives a SHA-256 token from `ADMIN_PASSWORD` and
  compares the cookie value; there is no server-side session store.
- **Member auth** — scrypt-hashed PINs, `timingSafeEqual` comparison, and an **HMAC-SHA256 signed** session cookie (HttpOnly, `Secure` in production) that cannot be forged from a guessable member id.
- **Rate limiting** on the AI endpoint.
- **No known-credential accounts in production** — demo members (`NX-8492` / PIN
  `1234`) are seeded only outside production and only for the default tenant.
- **Security headers** set globally in `next.config.ts`: HSTS (2 years, preload),
  `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: origin-when-cross-origin`, and a `Permissions-Policy` that disables
  camera, microphone and geolocation.
- **`poweredByHeader: false`** and **`console.*` stripped in production**.

---

## Testing

Vitest runs in a Node environment with the `@` → `src` alias.

```bash
npm test        # vitest run
```

CI runs `lint`, `typecheck`, `test` and `build` on every push and pull request via
Gitea/Forgejo Actions — see `docs/CI.md` for the runner setup.

| Test file | Coverage |
|---|---|
| `src/lib/aiWorkoutEngine.test.ts` | Exact day count (3/4/5/6), split per frequency, day renumbering for cycled 5–6 day splits, 4-vs-3 sets by session length, goal-driven reps/rest, shoulder-injury exercise exclusion. |
| `src/lib/api.test.ts` | `adminRoute` guard: rejects missing/tampered cookies (`401`), passes authenticated requests, wraps handler throws into a `500` envelope. |
| `src/lib/sqliteDb.test.ts` | Uses an isolated temp `SQLITE_DATA_DIR`; covers seeding, member PIN auth, invalid-PIN rejection, plan persistence/round-trip, invalid payloads, admin member listing (asserts `pin_code` never leaks), member upsert/delete, lead create + status update, gym-config get/update. Cleans up in `afterAll`. |
| `src/lib/demoMockApi.test.ts` | Demo mock API: config, demo login, plan persistence across logins, export attachment, erasure, lead submissions. |

---

## Deployment

Three supported paths, all detailed in `deploy/DEPLOYMENT_GUIDE.md`.

**Docker Compose (recommended for a VPS)** — `deploy/docker-compose.yml` brings up
three services:

- `nexusfit_app` — the app built from `deploy/Dockerfile` (multi-stage `node:22-alpine`,
  runs as a non-root user, executes the standalone `server.js`), bound to
  `127.0.0.1:3000` with the SQLite file on the named volume `nexusfit_data`.
- `caddy` — TLS termination and reverse proxy on ports 80/443 (`deploy/Caddyfile`).
- `db_backup` — an Alpine sidecar that tars the database daily and prunes backups
  older than 14 days.

```bash
npm run docker:build
GEMINI_API_KEY=… SITE_DOMAIN=example.com npm run docker:up
npm run docker:down
```

**PM2 (bare-metal)** — `deploy/ecosystem.config.js` runs `next start` in cluster mode
across all cores.

**Read-only filesystems / Vercel** — because the app writes SQLite to disk, point
`SQLITE_DATA_DIR` at a writable path (e.g. `/tmp`) when the filesystem is read-only.
Note that such paths are ephemeral — this is suitable for testing, not durable hosting.

`.next/standalone/` plus `npm run serve:prod` embed only the files the server needs,
so no `node_modules` install is required at runtime.

**GitHub Pages (interactive demo)** — `.github/workflows/pages.yml` builds `site/`
with Vite and deploys it to
[evangelosmoschou.github.io/NexusFit](https://evangelosmoschou.github.io/NexusFit/).
The demo answers every `/api/*` request in the browser via `site/src/mockApi.ts` and
persists data in `localStorage`; it deliberately has no server-side functionality.

---

## Known Gaps & Roadmap

- **PWA theme mismatch** — `public/manifest.webmanifest` still ships the old lime theme
  (`#CCFF00` / `#08080A`) while the app uses the sky-cyan/graphite palette
  (`#38BDF8` / `#181A20`).
- **`GEMINI_MODEL` is documented but not read** — the chat route hardcodes
  `gemini-2.0-flash-lite`, so setting the env var has no effect today.
- **One database per tenant** — isolation comes from separate SQLite files rather
  than a shared schema with row-level security. Simple and safe, but it does not
  support cross-gym reporting; a shared Postgres schema with RLS would be the
  path for that.
- **Synchronous `scrypt`** — PIN/admin-password hashing blocks the event loop, so
  in a shared process one gym's login burst briefly stalls the others. Async
  `scrypt` behind the `Repository` boundary is the remaining task.
- **In-memory rate limiting** — resets on restart and is per-process, so it does
  not hold under a PM2 cluster or multiple containers.
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

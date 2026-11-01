# Hetzner deployment checklist

A single Hetzner VPS (CX22 or larger is enough for a single gym) running Docker
Compose: the Next.js app, Caddy for TLS, a consistent SQLite backup sidecar and
the GDPR retention job.

## 1. Prerequisites

- A server with Docker Engine and the Compose plugin.
- DNS: an `A` (and optionally `AAAA`) record for the domain pointing at the
  server's public IP.
- Firewall: allow SSH, 80 and 443 only. Do **not** expose port 3000 publicly;
  compose already binds it to `127.0.0.1`.

## 2. Configure

```bash
git clone <repo> nexusfit && cd nexusfit
cp deploy/.env.production.example deploy/.env
# edit deploy/.env: SITE_DOMAIN, NEXT_PUBLIC_SITE_URL, SESSION_SECRET,
# ADMIN_PASSWORD, TRAINER_PASSWORD, ACCESS_CONTROL_KEY, GYM_TIMEZONE,
# CRON_SECRET (and GEMINI_API_KEY if used)
```

`SESSION_SECRET` must be at least 16 characters; generate it with
`openssl rand -hex 32`. Compose refuses to start if the required secrets are
missing.

## 3. Build and start

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Caddy obtains the TLS certificate on first request. Check:

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml ps
curl -fsS https://<domain>/api/health
docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs -f nexusfit_app
```

The admin panel is at `https://<domain>/admin` with `ADMIN_PASSWORD` (owner /
recovery) or with a named staff admin account created from **Admin → Προσωπικό**.
The staff area is at `https://<domain>/trainer` with a staff trainer account, or
with the optional legacy `TRAINER_PASSWORD`. The entrance tablet is at
`https://<domain>/checkin`.

## 4. Data and backups

- SQLite lives in the `nexusfit_data` volume (`/app/data`), one file per tenant
  plus `registry.db`.
- `nexusfit_db_backup` writes a consistent snapshot of every database to
  `deploy/backups/` on start and every 24 hours, keeping 14 days.
- Copy backups off the server (e.g. `rsync` or Hetzner Storage Box). A backup
  that only exists on the same VPS is not a backup.

Restore (stop the app, replace the file, start):

```bash
docker compose --env-file deploy/.env -f deploy/docker-compose.yml stop nexusfit_app
docker run --rm -v nexusfit_data:/data -v "$PWD/deploy/backups:/backups" alpine \
  sh -c "cp /backups/nexusfit-<timestamp>.db /data/nexusfit.db"
docker compose --env-file deploy/.env -f deploy/docker-compose.yml start nexusfit_app
```

Tenant files are flattened in the backup names (`tenants_iron-<timestamp>.db`
→ `/data/tenants/iron.db`). Restore `registry-<timestamp>.db` too when the
tenant list changed.

## 5. Updating

```bash
git pull
docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Environment changes require a rebuild only for `NEXT_PUBLIC_*` values (they are
inlined at build time). Everything else is read at runtime.

## 6. Preview builds (optional)

The Docker build hides the theme switcher by default; opt in with:

```bash
NEXT_PUBLIC_THEME_PREVIEW=1 docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
```

Then the floating «Θέμα» control and `?theme=sand|volt|coastal` work. Keep this
off on the final public deployment, then rebuild with `0`.

## 7. Operational notes

- **Single instance.** SQLite and the in-memory rate limiter assume one app
  container. Scaling out needs Postgres and a shared rate-limit store.
- **Rate limits** apply to member login (20/min per IP, 5/min per member code),
  admin login (5/min per IP) and lead submissions (5 per 10 min per IP).
- **scrypt is synchronous.** A burst of logins blocks the event loop; this is
  fine for a single gym, not for high concurrency.
- **Docker logs** are capped (10 MB × 3) so the disk cannot fill.
- **Healthcheck** hits `/api/health`; Caddy and the cron jobs wait for it.
- **Demo credentials** are never seeded unless `DEMO_MODE=1` is set. Do not set
  it in `deploy/.env`.
- **Password rotation** — the legacy admin/trainer passwords are hashed when the
  default tenant is first seeded. Changing the variables in `deploy/.env` later
  does not update the stored hashes; rotate them explicitly with
  `npm run tenant:password -- default admin '<new>'` (or `trainer`). Named staff
  account passwords are changed from **Admin → Προσωπικό**, which invalidates
  that account's sessions immediately.
- **Staff offboarding** — deactivate or permanently delete the staff account
  from **Admin → Προσωπικό**. Deletion removes name, email, password hash,
  permissions and sessions; the legacy owner credential remains available.
- **Audit log** — staff/admin logins and writes are retained for 12 months and
  purged by `POST /api/cron/retention`. Staff deletion anonymizes the actor
  fields. Back it up with the rest of the tenant databases.
- **Never run `docker compose down -v`** unless you intend to delete the
  `nexusfit_data` volume, which holds every database.

## 8. Security checklist

- `chmod 600 deploy/.env` — it holds the legacy admin/trainer passwords and the
  session secret.
- Use `openssl rand -hex 32` for `SESSION_SECRET`, `ACCESS_CONTROL_KEY` and
  `CRON_SECRET`; pick long random `ADMIN_PASSWORD` and `TRAINER_PASSWORD` values
  (16+ characters). The server logs a `[security]` warning at boot when one is
  missing or short.
- The entrance scanner sends QR tokens to `/api/access/scan` with the
  `x-access-key` header. Set `ACCESS_CONTROL_KEY` before enabling the device;
  without it QR access is disabled. `reentryCooldownMinutes` defaults to **0**;
  duplicate/quick re-entry anomalies are shown in **Admin → Πρόσβαση** and raise
  an alarm above one event per rolling 7 days.
- The trainer area lives at `/trainer` (permission-based: occupancy, member
  profiles, plans and visits, desk check-in/out, optional announcements/schedule)
  and the entrance tablet at `/checkin`. Share those URLs with staff, not with
  the public site. Permissions are enforced server-side.
- Copy backups **off the server** and encrypt them (restic, borg, or an
  encrypted Hetzner Storage Box). They contain member data and PIN hashes.
- Keep the host patched (`unattended-upgrades` or regular `apt upgrade`) and
  expose only 22/80/443.
- Optionally put Cloudflare's free proxy in front for DDoS/WAF; keep Caddy's
  TLS mode on Full (strict).
- Not implemented yet: a Content-Security-Policy (Next injects inline RSC
  scripts, so it needs nonces) and two-factor authentication for `/admin`.

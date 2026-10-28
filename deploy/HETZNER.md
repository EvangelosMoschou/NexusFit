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
# ADMIN_PASSWORD, CRON_SECRET (and GEMINI_API_KEY if used)
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

The admin panel is at `https://<domain>/admin` with `ADMIN_PASSWORD`.

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

The theme switcher is **off** unless the build opts in:

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
- **Admin password rotation** — the password is hashed when the default tenant
  is first seeded. Changing `ADMIN_PASSWORD` later does not update the stored
  hash; rotate it deliberately or recreate the registry.
- **Never run `docker compose down -v`** unless you intend to delete the
  `nexusfit_data` volume, which holds every database.

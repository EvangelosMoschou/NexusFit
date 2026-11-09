# Monitoring Guide

## Uptime probe

- Probe `GET /api/health` every 60s. Expect HTTP 200 with body
  `{"success":true,"ok":true,"uptime":…,"timestamp":…}`.
- The endpoint performs no DB access, so a 200 means the app process itself is up.
  It does **not** prove the SQLite volume is writable — the daily authenticated
  check below is the cheapest proxy for that.
- Free options: [UptimeRobot](https://uptimerobot.com) (50 monitors, 5-min interval
  free tier) or a Hetzner status-page check with 60s interval.

## Daily authenticated check

- Once per day, call `GET /api/admin/config` **without** a cookie and expect HTTP 401.
  A non-401 response means the auth layer is broken.
- Can be a scheduled curl from any box:
  `curl -m 5 -s -o /dev/null -w '%{http_code}' https://YOUR-DOMAIN/api/admin/config` → expect `401`.

## Log rotation

- **Docker:** already configured — every service in `deploy/docker-compose.yml`
  carries a `logging: json-file` block (`nexusfit_app` and `caddy` keep 3×10 MB,
  the two sidecars 2×5 MB). Verify after editing compose; do not add a second
  block to a service that already has one.
- **PM2:** `pm2 install pm2-logrotate` (defaults: 10MB per file, rotation enabled).

## Disk watch

- Watch `data/nexusfit.db` (default tenant) **and** `data/registry.db` (tenant
  registry) — both grow with members, plans and logs. Every additional tenant adds
  its own database file in the same directory.
- Watch the `deploy/backups/` folder — ensure snapshots land and old ones prune.

## Backups

### Docker (default)

The `db_backup` sidecar runs `deploy/backup.mjs` every 24 h and writes a
`VACUUM INTO` snapshot of **every** database under `DATA_DIR` (registry + all
tenants), then deletes snapshots older than `BACKUP_RETENTION_DAYS`. It is
configured in `docker-compose.yml`:

| Variable | Default | Meaning |
|---|---|---|
| `DATA_DIR` | `/data` | Directory to snapshot (the `nexusfit_data` volume, mounted read-only) |
| `BACKUP_DIR` | `/backups` | Snapshot destination (bind-mounted to `deploy/backups/`) |
| `BACKUP_RETENTION_DAYS` | `14` | Snapshots older than this are deleted |

Check it with `docker compose --env-file deploy/.env -f deploy/docker-compose.yml logs db_backup`.

### Non-Docker hosts

- Use `deploy/backup-db.sh` from cron:
  ```
  15 3 * * * /bin/bash /opt/nexusfit/deploy/backup-db.sh >> /var/log/nexusfit-backup.log 2>&1
  ```
- It defaults to `./backups` and prunes archives older than 14 days; pass a
  directory as the first argument to override.

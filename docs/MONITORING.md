# Monitoring Guide

## Uptime probe

- Probe `GET /api/health` every 60s. Expect HTTP 200 with body `{"ok":true,...}`.
- The endpoint performs no DB access, so a 200 means the app process itself is up.
- Free options: [UptimeRobot](https://uptimerobot.com) (50 monitors, 5-min interval free tier) or a Hetzner status-page check with 60s interval.

## Daily authenticated check

- Once per day, call `GET /api/admin/config` **without** a cookie and expect HTTP 401. A non-401 response means the auth layer is broken.
- Can be a scheduled curl from any box:
  `curl -m 5 -s -o /dev/null -w '%{http_code}' https://YOUR-DOMAIN/api/admin/config` → expect `401`.

## Log rotation

- **Docker:** add to each service in `docker-compose.yml` (do not commit without review):
  ```yaml
  logging:
    driver: json-file
    options:
      max-size: "10m"
      max-file: "3"
  ```
- **PM2:** `pm2 install pm2-logrotate` (defaults: 10MB per file, rotation enabled).

## Disk watch

- Watch `data/nexusfit.db` growth (SQLite, grows with members/plans/logs).
- Watch the `deploy/backups/` folder — ensure backups land and prune old ones.

## Backups (non-Docker hosts)

- Use `deploy/backup-db.sh` from cron:
  ```
  15 3 * * * /bin/bash /opt/nexusfit/deploy/backup-db.sh >> /var/log/nexusfit-backup.log 2>&1
  ```

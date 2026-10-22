# NexusFit — Documentation

Operational and design documentation for the NexusFit platform.

- [CI.md](./CI.md) — Gitea/Forgejo Actions pipeline and runner setup.
- [MONITORING.md](./MONITORING.md) — uptime probes, log rotation and backup strategy.
- [50_RULES_WEBSITE_CHECKLIST.txt](./50_RULES_WEBSITE_CHECKLIST.txt) — the design and
  quality checklist this project follows.

## Running the app

From the repository root:

```bash
npm run dev                        # development (http://localhost:3000)
npm run build && npm run start     # production
npm test                           # unit tests
```

See the root [README](../README.md) for architecture, configuration, API reference
and deployment details.

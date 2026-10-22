# CI (Gitea / Forgejo Actions)

Continuous integration runs on every push and pull request from
`.gitea/workflows/ci.yml`:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`

## Prerequisite: an Actions runner

Gitea/Forgejo Actions does **not** run jobs by itself — it needs a registered
runner. Install `act_runner` on the host (or a separate machine) and register it
with your instance:

```bash
# On the runner host
docker run --detach \
  --name gitea-runner \
  --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd)/runner-data:/data \
  gitea/act_runner:latest

# Register it against your instance (get the token from
# Site Administration -> Actions -> Runners)
docker exec -it gitea-runner act_runner register \
  --instance https://your-gitea-host \
  --token <REGISTRATION_TOKEN> \
  --labels ubuntu-latest:docker://node:22-bookworm
```

The workflow uses the `ubuntu-latest` label, mapped above to a Node 22 image so
`actions/setup-node` has a compatible base.

## Forgejo note

Forgejo (>= 1.21) also reads `.forgejo/workflows/`. If you run Forgejo rather
than Gitea, you can either keep the `.gitea/` path (still supported) or move the
file to `.forgejo/workflows/ci.yml`.

## Running the same checks locally

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Optional: add a pre-push hook (`.git/hooks/pre-push`) running the same command
so failures are caught before they reach CI.

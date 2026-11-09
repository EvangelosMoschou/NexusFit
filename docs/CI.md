# CI (Gitea / Forgejo Actions)

Continuous integration runs on every push and pull request from
`.gitea/workflows/ci.yml`:

1. `npm ci`
2. `npm run audit:prod` — production dependency advisories (high+ fail the run)
3. `npm run lint`
4. `npm run typecheck`
5. `npm test`
6. `npm run check:docs` — docs-vs-code drift (see below)
7. `npm run demo:build` — the Vite demo in `site/` must still build
8. `npm run build`

`check:docs` fails only on drift the documentation owns: a documented env var that
nothing reads, a documented npm script that does not exist, a broken relative link,
or a variable in `deploy/.env.production.example` missing from the README table.
Things a feature branch legitimately makes stale — an undocumented new module, test,
route or table — are reported as warnings and do not fail the build. Run
`npm run check:docs -- --strict` locally to see the full list as errors.

`demo:build` exists because the demo is a separate Vite build deployed to GitHub
Pages; without it a broken import in `site/` would only surface after the Pages
deploy failed.

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
npm run audit:prod \
  && npm run lint \
  && npm run typecheck \
  && npm test \
  && npm run check:docs \
  && npm run demo:build \
  && npm run build
```

Optional: add a pre-push hook (`.git/hooks/pre-push`) running the same command
so failures are caught before they reach CI.

`format:check` is **not** part of CI yet: the repository predates the Prettier
config and a large part of `src/` is not formatted, so the gate would be red on
day one. Run `npm run format` once to normalise the tree, then add
`npm run format:check` to the workflow.

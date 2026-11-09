# Supply-chain & CI security

How NexusFit manages the security of what it installs, builds and ships: the
gates that run on every pull request, what each one catches, how to run the same
checks locally, and what is still missing.

- [Goals and threat model](#goals-and-threat-model)
- [The gates at a glance](#the-gates-at-a-glance)
- [1. Reproducible installs](#1-reproducible-installs)
- [2. Production dependency audit](#2-production-dependency-audit)
- [3. SBOM (CycloneDX)](#3-sbom-cyclonedx)
- [4. Dependency review (pull requests)](#4-dependency-review-pull-requests)
- [5. Secret scanning (Gitleaks)](#5-secret-scanning-gitleaks)
- [6. SAST (Semgrep and CodeQL)](#6-sast-semgrep-and-codeql)
- [7. Filesystem & container scanning (Trivy)](#7-filesystem--container-scanning-trivy)
- [8. Dependency updates (Dependabot)](#8-dependency-updates-dependabot)
- [Running the gates locally](#running-the-gates-locally)
- [Repository settings and branch protection](#repository-settings-and-branch-protection)
- [Secrets, tokens and plan requirements](#secrets-tokens-and-plan-requirements)
- [Operating the pipeline](#operating-the-pipeline)
- [Roadmap](#roadmap)
- [Further reading](#further-reading)

---

## Goals and threat model

The pipeline exists to answer four questions on every change, cheaply and
automatically:

1. **Did we just add something dangerous?** A new or updated dependency, a git
   dependency, a postinstall script, a typosquatted package, an unexpected
   maintainer change.
2. **Did we leak something?** A key, token, password, database file or `.env`
   committed to the repository (now or in history).
3. **Do we ship something known-bad today?** A vulnerable transitive dependency
   in the runtime tree, a vulnerable base image, a misconfigured Dockerfile.
4. **Is the application code exploitable?** Injection, SSRF, path traversal,
   unsafe deserialisation, auth mistakes.

In scope, therefore: dependency confusion and typosquatting, compromise of an
upstream package or its maintainer, malicious lifecycle scripts, leaking CI
credentials or `GITHUB_TOKEN`, unreviewed or unpinned GitHub Actions, an
over-privileged workflow, and a vulnerable or unmaintained Docker base image.

Out of scope for this document (see [Roadmap](#roadmap)): runtime protection,
infrastructure scanning of the hosting account, and DAST against a live
deployment.

---

## The gates at a glance

Everything below lives in two workflow files and one configuration file.

| Gate | Tool | Trigger | Enforcement |
|---|---|---|---|
| Lockfile install | `npm ci` | PR, push to `main`, manual | Blocking |
| Typecheck / tests / lint | `tsc --noEmit`, Vitest, ESLint | PR, push to `main`, manual | Blocking |
| Production audit | `npm audit --omit=dev --audit-level=high` | PR, push to `main`, manual | **Blocking** (high + critical) |
| Full audit incl. dev deps | `npm audit` | PR, push to `main`, manual | Report only |
| SBOM | `@cyclonedx/cyclonedx-npm` | PR, push to `main`, manual | Artifact, 90-day retention |
| Dependency review | `actions/dependency-review-action` | Pull requests only | **Blocking** (high + critical) |
| Secret scanning | Gitleaks (full git history) | PR, push to `main`, manual | **Blocking** + SARIF |
| SAST (fast) | Semgrep `p/ci` | PR, push to `main`, manual | SARIF, report only |
| SAST (deep) | CodeQL `javascript-typescript` | PR/push to `main`, weekly cron | SARIF + code scanning |
| Filesystem scan | Trivy `fs` (vuln, secret, misconfig) | PR, push to `main`, manual | SARIF, report only |
| Dependency updates | Dependabot | Weekly (Monday) | Pull requests |

Files:

| File | Purpose |
|---|---|
| `.github/workflows/security.yml` | All the gates above except CodeQL |
| `.github/workflows/codeql.yml` | CodeQL analysis + weekly scheduled run |
| `.github/dependabot.yml` | Weekly npm and GitHub Actions update PRs |
| `.gitleaks.toml` | Gitleaks rules + documented allowlists |
| `SECURITY.md` | Vulnerability disclosure policy |
| `public/.well-known/security.txt` | RFC 9116 machine-readable contact |

The GitHub workflows complement, and do not replace, the Gitea/Forgejo pipeline
in `.gitea/workflows/ci.yml` (see [`docs/CI.md`](../CI.md)). A self-hosted Gitea
mirror runs lint, typecheck, tests, build and the production audit; it does not
run GitHub-only tooling such as code scanning or Dependabot.

### Permissions

Both workflows start from `permissions: contents: read`. The only escalation is
`security-events: write`, requested solely by the jobs that upload a SARIF file
(`secrets`, `sast`, `filesystem-scan`, and CodeQL `analyze`). No job has
`contents: write`, no job can push commits or modify releases, and
`persist-credentials: false` is set on every checkout so the token is not left in
`.git/config` for later steps.

Every SARIF upload is additionally marked `continue-on-error: true` with an
`hashFiles()` guard: pull requests from forks receive a read-only `GITHUB_TOKEN`,
so the upload can legitimately fail while the scan itself still runs. In that
case the raw SARIF is available as a workflow artifact.

---

## 1. Reproducible installs

- `package-lock.json` is committed and CI always runs **`npm ci`** — never
  `npm install` — so the dependency tree in CI is exactly the reviewed one.
  `npm install` can silently rewrite the lockfile; `npm ci` fails instead.
- `engines.node` pins the runtime to Node 22 and `actions/setup-node` requests
  the same major, with npm cache enabled.
- Dependency count is a security feature here: the app ships four runtime
  dependencies (`next`, `react`, `react-dom`, `lucide-react`). Adding a runtime
  dependency needs a justification in the PR description (what it replaces, why
  it cannot be ~50 lines of local code).
- Lifecycle scripts run during `npm ci`. If you need to reduce that risk further
  (for example when reviewing an untrusted fork), install with
  `npm ci --ignore-scripts` and re-enable only the scripts you need. The
  security workflow currently installs normally because Vitest/Next need their
  optional native binaries.

Hardening idea for future work: `npm ci --ignore-scripts` in the
`supply-chain` job (SBOM generation only reads manifests) and
`npm audit signatures` to verify registry signatures for the production tree.

---

## 2. Production dependency audit

```bash
npm run audit:prod     # npm audit --omit=dev --audit-level=high
```

- `--omit=dev` audits only the packages that run in production. Advisories that
  exist only in build tooling do not block a fix.
- `--audit-level=high` exits non-zero for **high** and **critical** advisories;
  moderate and low ones are still printed.
- The same step exists in the Gitea pipeline, so a self-hosted mirror enforces
  it too.
- A separate, non-blocking `npm audit` step lists dev-only advisories in the log.

When the gate fails:

1. Read the advisory and decide: **fix** (bump the direct or transitive
   dependency), **mitigate** (unreachable code path, compensated control), or
   **accept** (documented, time-boxed).
2. Prefer an upstream fix. If only a transitive dependency is affected, use
   `overrides` in `package.json` rather than patching `node_modules`.
3. If you must accept the risk, record it in the PR description with an expiry
   date and open a tracking issue. Do not add a blanket ignore.

---

## 3. SBOM (CycloneDX)

Every run produces a **CycloneDX 1.6 JSON** software bill of materials:

```bash
npm run sbom           # npx --yes @cyclonedx/cyclonedx-npm@6.0.1 --output-file sbom.json
```

The workflow generates `sbom.json` after `npm ci` and uploads it as the
`sbom-cyclonedx` artifact with 90-day retention. It describes the root component
(`nexus-fit@<version>`) and the full dependency graph (~438 components, including
dev tooling and their transitive dependencies), with Package URLs, licenses and
hashes.

Why it matters:

- **Incident response.** When a package is compromised, you can answer "are we
  affected, and in which images?" by querying stored SBOMs instead of rebuilding.
- **Customer and auditor questions.** Operators deploying NexusFit for a gym can
  attach the SBOM to their own records.
- **Offline vulnerability scanning.** Trivy, Grype and Dependency-Track all
  consume CycloneDX:

  ```bash
  trivy sbom sbom.json
  grype sbom:sbom.json
  ```

Notes:

- The SBOM includes **dev** dependencies by default, because they are part of
  what builds the artifact. For a runtime-only SBOM, run
  `NODE_ENV=production npx --yes @cyclonedx/cyclonedx-npm@6.0.1 --output-file sbom.json`.
- `sbom.json` is generated output and is gitignored; the artifact in the Actions
  run is the record of what was built. Download it from the run summary
  (Artifacts → `sbom-cyclonedx`) or with `gh run download`.
- If you need bit-for-bit reproducible SBOMs, add `--output-reproducible` and pin
  the tool version (`@cyclonedx/cyclonedx-npm@6.0.1`).

---

## 4. Dependency review (pull requests)

`actions/dependency-review-action@v5.0.0` compares the dependency graph of the
base branch with the pull request and fails when the diff introduces a package
with a **high** or **critical** advisory — or a package that has no advisory
yet but is on a deny list you configure.

It is the only gate that judges the **change** rather than the current state,
which is what makes it useful: a repository can be clean today and still merge a
vulnerable dependency tomorrow.

- Runs only on `pull_request` (`if: github.event_name == 'pull_request'`).
- `comment-summary-in-pr: never` keeps the job at `contents: read`. To get the
  summary comment, set it to `on-failure` **and** add `pull-requests: write`.
- Requires the repository **dependency graph**, which is enabled by default on
  public repositories. On private repositories dependency review needs GitHub
  Advanced Security / GitHub Code Security.
- Useful optional inputs (uncomment in the workflow when needed):
  - `fail-on-scopes: runtime` — only block runtime dependencies, warn on dev.
  - `allow-ghsas: GHSA-xxxx-xxxx-xxxx` — time-boxed exception with a comment.
  - `license-check: true` + `deny-licenses: "AGPL-3.0, GPL-3.0"` if you ship
    NexusFit under a non-AGPL commercial license and need to keep copyleft out
    of the bundle.
  - `show-openssf-scorecard: true` — attach upstream project health to the
    summary.
  - `warn-only: true` — observe before enforcing.

---

## 5. Secret scanning (Gitleaks)

`secrets` job:

1. Checkout with `fetch-depth: 0` — **the full history is scanned**, because a
   secret that was committed and later deleted is still leaked.
2. Download a pinned Gitleaks release (`GITLEAKS_VERSION`) and verify it against
   the published `gitleaks_<version>_checksums.txt` before running it.
3. `gitleaks git --redact --config .gitleaks.toml --report-format sarif
   --exit-code 1`

- Findings **fail the job** and are uploaded to code scanning (category
  `gitleaks`) with secret values redacted. The redacted SARIF is also uploaded as
  an artifact.
- `.gitleaks.toml` keeps the default rules and only allowlists values that can
  never be real credentials: placeholders in `.env.*.example` files and the dummy
  values used by the CI pipeline itself. Adding an allowlist entry requires a
  comment explaining why; never allowlist a rule or a path "to make CI green".
- GitHub's own **secret scanning + push protection** should additionally be
  enabled in repository settings (free for public repositories). It blocks the
  push before the secret reaches the remote, which is strictly better than
  detecting it afterwards.

If a secret is found:

1. **Rotate it first** — assume it is compromised the moment it is committed.
   For NexusFit that means `SESSION_SECRET`, `ADMIN_PASSWORD`,
   `TRAINER_PASSWORD`, `ACCESS_CONTROL_KEY`, `CRON_SECRET`, `GEMINI_API_KEY`
   (rotate at Google AI Studio), or the affected tenant password
   (`npm run tenant:password -- <tenant> admin '<new>'`).
2. Remove it from the working tree and add the file to `.gitignore`.
3. Rewrite history only if the repository is not widely cloned, using
   `git filter-repo`; otherwise treat the secret as permanently public.
4. Verify existing logs and backups for exposure (see
   [`docs/MONITORING.md`](../MONITORING.md)).

---

## 6. SAST (Semgrep and CodeQL)

Two complementary static analysers, on purpose: Semgrep is fast, rule-driven and
runs in seconds; CodeQL builds a semantic database and finds deeper data-flow
bugs.

### Semgrep (`sast` job)

```bash
semgrep scan --config p/ci
```

- Installed with `pip install "semgrep>=1.100,<2"`; results are written as SARIF
  and uploaded to code scanning (category `semgrep`).
- **No `SEMGREP_APP_TOKEN` is required.** The CLI uses the public `p/ci` rule
  pack and never contacts the Semgrep platform, so the job cannot fail because a
  secret is missing, and it works identically on fork pull requests.
- Metrics are disabled (`SEMGREP_SEND_METRICS=off`).
- The job is **report only** (Semgrep exits 0 with findings; the SARIF upload is
  the delivery). Once the baseline is clean, promote it to a hard gate by adding
  `--error` to the scan command — or by requiring the `semgrep` tool in branch
  protection ("Require code scanning results" → add tool `semgrep`).
- Optional upgrade: with a Semgrep account, set `SEMGREP_APP_TOKEN` as a secret
  and switch to `semgrep ci` to get diff-aware scans, policies and PR comments.
  Treat the token as optional in the workflow (`env: SEMGREP_APP_TOKEN:
  ${{ secrets.SEMGREP_APP_TOKEN }}` plus a guard) so the job still works without
  it.

### CodeQL (`.github/workflows/codeql.yml`)

- Language: `javascript-typescript`, `build-mode: none` (no build required, so
  `.next/` output and Turbopack are irrelevant).
- Triggers: push to `main`, pull requests to `main`, a weekly schedule
  (Mondays 03:41 UTC) and manual dispatch. The cron run matters: CodeQL ships new
  queries continuously, and a scheduled analysis re-evaluates unchanged code.
- Query suite: `security-extended` (more queries than the default suite). Remove
  the `queries:` line for faster runs.
- Permissions: `security-events: write` to upload, plus `contents: read`,
  `actions: read`, `packages: read`.

Code scanning is free for public repositories. On a private repository it
requires GitHub Advanced Security (or GitHub Code Security) to be enabled.

---

## 7. Filesystem & container scanning (Trivy)

```yaml
scan-type: fs
scan-ref: .
scanners: vuln,secret,misconfig
severity: CRITICAL,HIGH
ignore-unfixed: true
```

The `filesystem-scan` job runs Trivy against the checked-out tree. Without
`npm ci`, Trivy reads `package-lock.json` directly, so the job is fast and does
not execute any dependency code. It covers:

- **vuln** — advisories for the locked dependency graph (including the dev tree,
  which the SBOM also documents).
- **secret** — a second, independent secret detector (belt and braces with
  Gitleaks; different rule set, different false positives).
- **misconfig** — `deploy/Dockerfile`, `deploy/docker-compose.yml` and other IaC:
  root user, `ADD` instead of `COPY`, missing healthcheck, privileged mode,
  unpinned base image tags.

Results go to code scanning (category `trivy-filesystem`) with
`exit-code: "0"`, so the job reports rather than blocks. Triage through
**Security → Code scanning alerts**, filter by tool, and promote a rule to
blocking by setting `exit-code: "1"` (or by requiring code scanning results in
branch protection).

Scanning the **built image** is on the roadmap (see below): it is the only way to
see the Alpine base packages and any binaries baked into the runtime layer.

---

## 8. Dependency updates (Dependabot)

`.github/dependabot.yml` opens grouped PRs **weekly** (Mondays, Europe/Athens):

- **npm** (root `package.json` / `package-lock.json`), `versioning-strategy:
  increase`, limit of 5 open PRs.
  - Group `nextjs-react`: `next`, `react`, `react-dom`, `@types/react`,
    `@types/react-dom`, `eslint-config-next` — these must move together.
  - Group `minor-and-patch`: everything else, minor and patch only. Major bumps
    arrive individually so they get a real review.
- **github-actions**: all action bumps in a single weekly PR (limit 5 open PRs).

Notes:

- Dependabot **security updates** are separate from version updates: they are
  triggered by advisories, ignore `open-pull-requests-limit` (fixed limit of 10)
  and **ignore `cooldown`**, so a fix for a published advisory still arrives
  immediately.
- `cooldown` delays a version update for 7 days (`default-days`) after a release —
  14 days for npm majors, 3 days for npm patches, 7 days for Actions. A freshly
  published version is the most likely to be a compromised, broken or yanked
  release: the `event-stream`, `ua-parser-js` and `xz-utils` incidents all shipped
  through a new release. Dependabot applies a default 3-day cooldown even when the
  option is absent; the explicit block makes the policy reviewable and longer.
- Enable **Dependabot alerts** and **Dependabot security updates** under
  Settings → Code security and analysis, together with secret scanning and push
  protection.
- Every Dependabot PR runs the full security workflow, including dependency
  review and CodeQL, so a bad bump is caught before merge.
- For the Gitea/Forgejo mirror, use Renovate or Gitea's dependency-update
  integrations; Dependabot only runs on GitHub-hosted repositories.

---

## Running the gates locally

Minimum, before opening a PR:

```bash
npm run lint && npm run typecheck && npm test
npm run audit:prod
npm run sbom && trivy sbom sbom.json     # optional, needs Trivy installed
```

Full parity with CI, if the tools are installed:

```bash
# Secret scanning (full history, redacted)
gitleaks git --redact --config .gitleaks.toml --verbose

# SAST
semgrep scan --config p/ci

# Filesystem scan
trivy fs --scanners vuln,secret,misconfig --severity CRITICAL,HIGH .

# Workflow / YAML syntax
ruby -ryaml -e 'YAML.load_file(".github/workflows/security.yml")'
```

A convenient `.git/hooks/pre-push` running the minimum set is described in
[`docs/CI.md`](../CI.md).

---

## Repository settings and branch protection

Workflows only help if a failing run actually stops a merge. Recommended settings
for `main`:

**Settings → Branches → Branch protection rule for `main`**

- ✅ Require a pull request before merging
  - Required approvals: **1** (2 for `release/*`)
  - ✅ Dismiss stale pull request approvals when new commits are pushed
  - ✅ Require review from Code Owners (see `CODEOWNERS` below)
  - ✅ Require approval of the most recent reviewable push
- ✅ Require status checks to pass before merging
  - ✅ Require branches to be up to date before merging
  - Required checks:
    - `Install, typecheck, lint & test`
    - `Production audit & CycloneDX SBOM`
    - `Secret scanning (Gitleaks)`
    - `Dependency review` (PR events only)
    - `Analyze (javascript-typescript)` (CodeQL)
  - Optional until the baseline is clean: `SAST (Semgrep p/ci)`,
    `Trivy filesystem scan`
- ✅ Require conversation resolution before merging
- ✅ Require linear history (keeps revert and audit easy)
- ✅ Require signed commits (after every maintainer has a signing key configured)
- ✅ Do not allow bypassing the above settings (including administrators)
- ✅ Restrict who can push to matching branches (only the release bot, if any)

**Settings → Code security and analysis**

- ✅ Dependency graph, Dependabot alerts, Dependabot security updates
- ✅ Code scanning: CodeQL (the workflow registers itself; also set "Require code
  scanning results" under branch protection → Code scanning → `CodeQL`)
- ✅ Secret scanning **and push protection**
- ✅ Private vulnerability reporting (this is what `SECURITY.md` points to)

**Settings → Actions → General**

- Workflow permissions: **Read repository contents and packages permissions**
  (the workflows that need more ask for it explicitly).
- ✅ Require approval for all outside collaborators / first-time contributors
  running workflows (default for public repos: fork PRs need maintainer approval
  before workflows run).
- Do **not** grant "Allow GitHub Actions to create and approve pull requests".
- Restrict allowed actions to verified creators plus the explicit allowlist in
  this repository (`actions/*`, `github/*`, `aquasecurity/*`, `actions/dependency-review-action`).

**Tags and releases**

- Protect `v*` tags (no force-push, no deletion) once releases start.
- Use a `release` environment with required reviewers for anything that
  publishes an image or a package.

**CODEOWNERS** (create `.github/CODEOWNERS`) — at minimum:

```
/.github/            @EvangelosMoschou
/deploy/             @EvangelosMoschou
/package.json        @EvangelosMoschou
/package-lock.json   @EvangelosMoschou
/SECURITY.md         @EvangelosMoschou
```

This makes the CI definitions, the deployment assets and the dependency manifest
require an explicit review — the most valuable few lines of protection in the
repository.

**For the Gitea/Forgejo mirror**: enable branch protection on `main`, require the
`verify` job from `.gitea/workflows/ci.yml`, and disable force-push.

---

## Secrets, tokens and plan requirements

Nothing below is required for a green run on a public repository.

| Item | Required? | Used by | If absent |
|---|---|---|---|
| `GITHUB_TOKEN` | Automatic | All workflows | Provided by Actions; permissions are scoped per job |
| `SEMGREP_APP_TOKEN` | No | Semgrep | Not needed — the CLI uses the public `p/ci` pack |
| `GITLEAKS_LICENSE` | No | Gitleaks | Not needed — the CLI is used directly, and Gitleaks is free for personal/public use. Only the `gitleaks/gitleaks-action` wrapper requires a licence key for organisation-owned repos |
| `CODECOV_TOKEN` | No | — | Coverage upload is not configured |
| GitHub Advanced Security | No (public) / Yes (private) | CodeQL, dependency review | On a private repo without GHAS, the CodeQL and dependency-review jobs fail with a permissions/feature error — either enable GHAS or disable those two jobs |
| Dependency graph | Default on (public) | Dependency review | Job fails with "dependency graph not enabled" |

No long-lived cloud credentials are used. If a deploy workflow is added later,
use OIDC (`permissions: id-token: write`) with a cloud role instead of storing
static keys.

---

## Operating the pipeline

- **First run on a new fork or mirror:** expect the first Semgrep/Trivy run to
  produce a baseline of findings. Triage them in code scanning; do not weaken the
  rules to hide them.
- **Known Semgrep baseline.** On the current tree `p/ci` reports only
  `github-actions-mutable-action-tag`: every `uses:` in
  `.github/workflows/security.yml`, `codeql.yml`, `pages.yml` and
  `.gitea/workflows/ci.yml` is pinned to a *major* tag (`@v7`, `@v4`, …) rather
  than a commit SHA. That is deliberate for readability, and it is the one gap
  tracked by [roadmap item 9](#signed-releases-and-slsa) — pinning is the fix,
  not an allowlist. Nothing else is currently reported.
- **Interpreting a red PR:** the failing job name tells you the class of problem —
  `Production audit & CycloneDX SBOM` = known advisory (section 2),
  `Secret scanning (Gitleaks)` = secret in history (section 5),
  `Dependency review` = the PR itself introduces something vulnerable
  (section 4), CodeQL = application code.
- **Performance:** the whole matrix is designed to stay under ~10 minutes; the
  CodeQL job dominates. `concurrency` cancels superseded runs on the same ref, so
  pushing three fixups does not queue three full matrices.
- **Bumping a tool version:** edit `GITLEAKS_VERSION` in
  `.github/workflows/security.yml` (or the action tag / `trivy-action` version),
  and let the checksum verification or the action tag itself catch a bad pin.
  Dependabot handles GitHub Actions automatically; `trivy-action` and
  `dependency-review-action` arrive as version bumps.
- **Quarterly review:** re-read this document against the workflow files, check
  the retention/Expires date in `public/.well-known/security.txt`, confirm
  Dependabot is still merging, and review any allowlists in `.gitleaks.toml`.
- **When an advisory affects NexusFit:** follow the response table in
  [`SECURITY.md`](../../SECURITY.md); publish a GitHub Security Advisory, pin or
  override the dependency, and mention the required operator action (rebuild,
  rotate) in the release notes.

---

## Roadmap

The pipeline today covers the "known-bad dependency", "leaked secret" and
"vulnerable code" classes with report-and-block gates. The next steps, roughly in
order of value:

### Near term

1. **Container image scanning.** Build `deploy/Dockerfile` in CI and scan the
   image with Trivy (`scan-type: image`, `image-ref: nexusfit-app:ci`) — this is
   the only way to see Alpine base-image packages and the standalone server's
   runtime layer. Add a `docker` ecosystem entry to Dependabot (or Renovate) so
   the `node:22-alpine` digest is refreshed monthly.
2. **Required checks + CODEOWNERS.** Apply the branch-protection settings above
   and add `.github/CODEOWNERS`.
3. **Promote SAST to blocking.** Once the Semgrep baseline is triaged, add
   `--error` and require the `semgrep` tool in branch protection.
4. **Dependabot for Docker and, if a Python toolchain is added, pip.**

### Signed releases and SLSA

5. **Artifact attestations for builds.** Add
   `actions/attest-build-provenance@v4` to the release workflow so each image or
   tarball gets a provenance attestation signed by the workflow identity
   (Sigstore/Fulcio), verifiable with `gh attestation verify`.
6. **Sign container images with cosign** (`cosign sign --yes`,
   `cosign attest --predicate sbom.json`) and publish the SBOM alongside the
   image, ideally as an in-toto attestation.
7. **npm provenance** for any package published from this repository:
   `npm publish --provenance --access public` from GitHub Actions, using npm
   **trusted publishing** (OIDC) so no `NPM_TOKEN` exists. This yields a
   sigstore-backed, SLSA-level-3 provenance statement consumers can verify with
   `npm audit signatures`.
8. **SLSA target.** With a GitHub-hosted build, pinned action SHAs and a
   provenance attestation, a build can reach **SLSA v1.0 Build Level 3**; Level 4
   requires hermetic, two-party-reviewed builds. Document the claimed level in
   the release notes and in this file.
9. **Pin actions by commit SHA.** Replace `@v7` / `@v4` tags with full SHAs and
   keep the release in a trailing comment (`uses: actions/checkout@<sha> # v7.0.1`);
   Dependabot maintains SHA pins for the `github-actions` ecosystem. Tags are
   mutable — a compromised action repository can retag `v7` to malicious code —
   so this closes the `github-actions-mutable-action-tag` finding described under
   [Operating the pipeline](#operating-the-pipeline).
10. **Protect releases** with a `release` GitHub environment (required reviewers,
    tag rules), so publishing always needs a second pair of eyes.

### OpenSSF Scorecard

11. Add `.github/workflows/scorecard.yml`:

    ```yaml
    name: OpenSSF Scorecard
    on:
      branch_protection_rule:
      schedule:
        - cron: "17 4 * * 1"
      push:
        branches: [main]

    permissions: read-all

    jobs:
      analysis:
        runs-on: ubuntu-latest
        permissions:
          security-events: write
          id-token: write     # required to publish results to the OpenSSF API
          contents: read
          actions: read
        steps:
          - uses: actions/checkout@v7
            with:
              persist-credentials: false
          - uses: ossf/scorecard-action@v2.5.0
            with:
              results_file: scorecard.sarif
              results_format: sarif
              publish_results: true
          - uses: github/codeql-action/upload-sarif@v4
            with:
              sarif_file: scorecard.sarif
    ```

    Scorecard scores the *repository*, not the code: branch protection, pinned
    dependencies, code review, CI tests, security policy, signed releases. Expect
    the score to rise as items 1–10 land, and publish the badge in the README.

### Ongoing

12. **Hash-locked tool installs** — replace `pip install "semgrep>=…"` with a
    hash-pinned `requirements.txt`; `@cyclonedx/cyclonedx-npm` is pinned to
    `6.0.1`, but not yet hash-locked.
13. **`npm ci --ignore-scripts`** in the SBOM job, plus a periodic `npm audit
    signatures` check of the production tree.
14. **DAST** against a disposable environment (OWASP ZAP baseline scan) once a
    preview deployment exists.
15. **SBOM retention and querying** — ship `sbom.json` to Dependency-Track or a
    storage bucket so historical builds can be queried during an incident.
16. **VEX** — record "not affected" decisions for advisories that do not apply,
    so consumers of the SBOM get an accurate picture.
17. **Compliance mapping** — a high-level, explicitly partial map lives in
    [`README.md`](./README.md#standards-alignment-not-a-certification); expand
    and verify it per customer instead of treating the gates as certification.

---

## Further reading

- [SLSA specification](https://slsa.dev/spec/v1.0/)
- [OpenSSF Scorecard](https://github.com/ossf/scorecard)
- [CycloneDX](https://cyclonedx.org/) and the [npm tool](https://github.com/CycloneDX/cyclonedx-node-npm)
- [GitHub Actions security hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [GitHub code scanning / SARIF](https://docs.github.com/en/code-security/code-scanning)
- [RFC 9116 — security.txt](https://www.rfc-editor.org/rfc/rfc9116)
- [Sigstore / cosign](https://docs.sigstore.dev/)
- [`docs/CI.md`](../CI.md) — the Gitea/Forgejo pipeline and runner setup
- [`SECURITY.md`](../../SECURITY.md) — disclosure policy and response times

# Security Policy

NexusFit is a self-hosted gym platform: a public marketing site, a member portal,
an admin console and a staff area in one Next.js application, with per-tenant
SQLite databases. It handles member data, PINs, staff accounts, access-control
tokens and an audit trail, so we take reports seriously and appreciate the time
researchers spend on them.

**Please do not open a public GitHub issue, discussion or pull request for a
security vulnerability.** Public disclosure before a fix exists puts every
deployed gym and its members at risk.

---

## Supported versions

The project is pre-1.0 and follows a "latest line only" policy.

| Version | Supported | Notes |
|---|---|---|
| `main` (0.1.x) | ✅ | Development tip; fixes land here first |
| Latest `v0.1.x` release tag | ✅ | Receives security backports |
| Older `0.1.x` tags | ❌ | Upgrade to the latest tag |
| Forks / modified deployments | ⚠️ | Best effort — we can only fix the upstream code |

If you are running a modified version (custom components, a different data
layer, an extra reverse proxy), reproduce the issue against an unmodified
checkout of `main` as well, so we can tell an upstream bug from a local change.

---

## Reporting a vulnerability (private)

Use **GitHub Private Vulnerability Reporting** — it keeps the whole discussion,
the proof of concept and the fix private until an advisory is published:

1. Open <https://github.com/EvangelosMoschou/NexusFit/security/advisories/new>.
2. Describe the issue using the checklist below.
3. You will get a private advisory thread for triage, questions and remediation.

This requires a GitHub account and works for anyone (you do not need write access
to the repository).

**Alternative channel** — if you cannot use GitHub, email
**<security@nexusfit.example>** (placeholder: replace with the address published
in [`public/.well-known/security.txt`](./public/.well-known/security.txt) before
going live). If you want to encrypt the report, say so in a first, content-free
message and we will exchange a public key.

Please **do not**:

- open a public issue, PR, discussion or social-media thread;
- post details, screenshots or a PoC in any public channel before a fix is
  released and an advisory is published;
- test against a deployment you do not own (see the safe-harbor rules below).

---

## What to include

A report is much faster to triage when it contains:

1. **Summary** — one or two sentences on the impact and who is affected
   (anonymous visitor / member / premium member / trainer / staff admin / operator).
2. **Affected version or commit** — the release tag or `git rev-parse HEAD` of the
   checkout you tested.
3. **Environment** — deployment mode (Docker Compose, PM2, Vercel smoke test,
   local `npm run dev`), whether multi-tenancy is in use, and any relevant
   configuration (`DEMO_MODE`, reverse proxy, `SQLITE_DATA_DIR`).
4. **Reproduction steps** — exact requests or clicks; `curl` examples and raw
   HTTP are ideal. Mention any required cookies or roles.
5. **Proof of concept** — minimal payload, script or screenshots. Redact real
   member data, PINs, tokens and secrets.
6. **Impact** — what an attacker gains: authentication bypass, cross-tenant data
   access, privilege escalation, data exposure, denial of service, secret leak.
7. **Affected component** — the route (`src/app/api/...`), library
   (`src/lib/...`), workflow (`.github/workflows/...`) or deployment file.
8. **Suggested fix** (optional) — a patch or a direction is always welcome.
9. **Credit** — the name/handle you want in the advisory, or "anonymous".

---

## Response expectations

These are targets for a volunteer-maintained project, communicated in **Europe/Athens**
business hours:

| Stage | Target |
|---|---|
| Acknowledgement of the report | within **3 business days** |
| Initial triage: severity, affected versions, next steps | within **7 days** |
| Fix for **critical** (auth bypass, cross-tenant access, RCE, secret leak) | within **14 days** |
| Fix for **high** (privilege escalation, stored XSS, SSRF, sensitive data exposure) | within **30 days** |
| Fix for **medium / low**, or a documented decision not to fix | within **90 days** |
| Public advisory + CVE (when applicable) | after the fix is released, coordinated with you |

If a fix takes longer, you get an update at least every 14 days. If you do not
receive an acknowledgement within 5 business days, please escalate by emailing
the address above and reference the advisory link.

### Severity and scope

We use CVSS v4 as a starting point and adjust for context — for example a bug
that requires an already-compromised staff account is rated lower than one that
is reachable anonymously. Findings that only affect a deliberate demo instance
(`DEMO_MODE=1`, seeded credentials, mock API) are out of scope, but we still want
to hear about them.

### In scope

- Authentication and session handling: member PIN login, HMAC session cookies,
  legacy admin/trainer credentials, staff accounts and permissions.
- Tenant isolation: any way to read or write another gym's data.
- Authorisation bypasses in `/api/admin/*` and `/api/trainer/*`.
- Access control: QR token forgery, scanner-key leakage, anti-passback bypass.
- Injection (SQL, command, template), SSRF, path traversal, unsafe file upload.
- Stored/reflected XSS, CSRF on state-changing endpoints, open redirects.
- Sensitive data exposure (PIN hashes, staff password hashes, audit data,
  secrets in logs, backups written world-readable).
- Supply-chain issues in this repository: a compromised or typosquatted
  dependency, a workflow that can be tricked into leaking `GITHUB_TOKEN`, or a
  secret committed to the repository.

### Out of scope (please do not report)

- Vulnerabilities in **third-party dependencies**: report them upstream, then
  open a *normal* (non-security) issue referencing the advisory so Dependabot or
  a maintainer can bump it.
- Missing security headers, cookie flags, or TLS/HSTS configuration on a
  deployment that is not ours (for example, behind a proxy that strips them).
- Findings from an automated scanner without a demonstrated impact (e.g. "no
  rate limit" on an endpoint that already has one, or a self-XSS).
- Deliberate demo behaviour: seeded members `NX-8492` / `NX-3109`, `DEMO_MODE=1`,
  `admin1`/`trainer1` fallbacks, the static GitHub Pages demo
  (`site/`, mocked API, `localStorage` only).
- Missing MFA/2FA on `/admin` — deliberately deferred and documented; no fake
  second factor is shipped.
- Missing a full nonce-based `script-src` CSP — a partial CSP is enforced
  (`base-uri`, `form-action`, `frame-ancestors`, `object-src`); the remaining
  `script-src` gap is documented in the README roadmap.
- Denial of service through sheer traffic volume, spam form submissions, or
  resource exhaustion that requires an unrealistic request rate.
- Social engineering, phishing, physical access, or attacks requiring a
  compromised device or browser extension.
- Reports generated purely by a scanner with no tested exploit path.

---

## Safe harbor

We will not initiate or support legal action against researchers who act in good
faith and follow the rules below, and we consider their work authorised for the
purposes of applicable anti-hacking laws (including the Greek Criminal Code
provisions on unauthorised access and Directive 2013/40/EU).

To qualify:

- Test only against **your own local instance** (a checkout of `main` running on
  your machine, or a deployment you own and administer).
- Do **not** access, modify, delete or exfiltrate data that is not yours. Stop as
  soon as you can prove the issue; use a minimal proof of concept and redact any
  real member or staff data.
- Do **not** degrade, disrupt or overload a service; no denial-of-service,
  automated high-volume scanning, or spam.
- Do **not** use social engineering, phishing, physical access, or attacks on
  maintainers' accounts, infrastructure or CI secrets.
- Give us a reasonable opportunity to fix the issue before public disclosure,
  and keep the details private until an advisory is published.
- Comply with applicable law.

If, while testing, you incidentally access personal data, stop, delete what you
have, and tell us in the report. If you are unsure whether an action is allowed,
ask first through the private advisory — we will confirm in writing.

We are happy to credit reporters in the advisory and release notes unless you
prefer to stay anonymous.

---

## What we do after a report

1. Confirm the issue and assign a severity (CVSS v4 + project context).
2. Prepare a fix on a private branch, with tests where possible.
3. Release a patch, then publish a GitHub Security Advisory (and a CVE where one
   is warranted), crediting the reporter.
4. Add a regression test and, where relevant, a CI gate so the class of bug is
   caught automatically next time (see
   [`docs/security/supply-chain.md`](./docs/security/supply-chain.md)).
5. Notify operators through the release notes if a deployment action is required
   (rotating `SESSION_SECRET`, `ACCESS_CONTROL_KEY` or a password).

---

## Machine-readable policy

`/.well-known/security.txt` (source: [`public/.well-known/security.txt`](./public/.well-known/security.txt))
publishes the same contact and disclosure policy in [RFC 9116](https://www.rfc-editor.org/rfc/rfc9116) form.
That file is served statically by Next.js from the `public/` directory; the
`Contact` and `Canonical` values are placeholders that must be replaced with the
real domain and mailbox before a production deployment.

## Related documentation

- [`docs/security/supply-chain.md`](./docs/security/supply-chain.md) — CI security
  gates, SBOM, dependency review, branch-protection recommendations and roadmap.
- [`docs/MONITORING.md`](./docs/MONITORING.md) — uptime probes, logs and backups.
- [`README.md`](./README.md#security) — the security model and known gaps.

# Security documentation

Operational security notes for NexusFit. Vulnerability reporting is handled
outside this directory — see [`SECURITY.md`](../../SECURITY.md).

| Document | What it covers |
|---|---|
| [`supply-chain.md`](./supply-chain.md) | CI security gates (audit, SBOM, dependency review, secret scanning, Semgrep, CodeQL, Trivy), branch-protection recommendations, required secrets/tokens, and the roadmap for signed releases, SLSA and OpenSSF Scorecard. |
| [`../../SECURITY.md`](../../SECURITY.md) | Supported versions, private vulnerability reporting, response times, safe harbor. |
| [`../../public/.well-known/security.txt`](../../public/.well-known/security.txt) | RFC 9116 machine-readable contact (placeholders must be replaced before production). |
| [`../MONITORING.md`](../MONITORING.md) | Uptime probes, log rotation and backups. |
| [`../CI.md`](../CI.md) | Gitea/Forgejo pipeline and runner setup. |

## Where the controls live

```text
.github/workflows/security.yml   audit · SBOM · dependency review · Gitleaks · Semgrep · Trivy
.github/workflows/codeql.yml     CodeQL (javascript-typescript, weekly cron)
.github/dependabot.yml           weekly npm + GitHub Actions update PRs
.gitleaks.toml                   secret-scanning rules and documented allowlists
src/proxy.ts                     same-origin guard for mutating /api/* requests
src/lib/cookies.ts               __Host- session-cookie prefix + shared attributes
src/lib/memberSessions.ts        server-side session id, idle/absolute expiry, revocation
src/app/api/member/sessions      list/revoke devices; logout-all through /api/auth/logout
next.config.ts                   HSTS, CSP (partial), COOP/CORP, frame/object guards
```

## Standards alignment (not a certification)

This is an engineering map, not an audit, certification or claim of full
conformance. “Mapped” means the control exists and is tested where practical;
“partial” means the remaining gap is listed in the README roadmap.

| Framework | Mapped controls and evidence | Status |
|---|---|---|
| **OWASP ASVS 5.0 Level 2** | Authentication (scrypt, rate limits), session handling (`__Host-` cookies, HMAC, `SameSite`, server-side session records, revoke/logout-all, idle/absolute expiry), access control (tenant isolation, server-side permissions), validation/encoding, crypto, logging/audit, data protection, API auth, configuration/headers, supply-chain controls. | Partial; several V2/V3/V7/V14 items still open (MFA, full CSP, failed-login audit). |
| **NIST SSDF (SP 800-218)** | PO.1/PS.1/PS.2/PS.3 (security requirements, protected code, provenance), PW.4/PW.6/PW.7/PW.8 (reuse, review, secure coding, testing), RV.1/RV.2/RV.3 (vulnerability identification, response, root cause). | Partial; formal threat-model review and release signing are roadmap items. |
| **ISO/IEC 27001:2022 / 27002** | A.5.15 access control, A.8.5 secure authentication, A.8.8 technical vulnerabilities, A.8.9 configuration, A.8.15 logging, A.8.25 secure development, A.8.26 application requirements, A.8.28 secure coding, A.8.29 security testing, A.8.32 change management. | Partial; organisational ISMS controls are outside this repository. |
| **ENISA guidance** | Supply-chain security, vulnerability handling/disclosure, secure development and dependency hygiene reflect ENISA’s threat-landscape and supply-chain recommendations. | Aligned, not ENISA-certified (there is no ENISA web-app certification). |
| **GDPR / ePrivacy** | Data minimisation, privacy notice/consent, access/portability/erasure, retention, audit, breach-readiness and processor documentation. | Partial; DPIA/ROPA, DPAs/SCCs and the 72-hour breach runbook still need legal/operational sign-off. |
| **NIS2 / EU CRA** | Applicability and supplier-due-diligence assessment tracked separately; this repository does not claim compliance. | Assessment pending. |

## Before you deploy

1. Replace `Contact` and `Canonical` in `public/.well-known/security.txt` with the
   real domain and mailbox, and confirm
   `https://<domain>/.well-known/security.txt` is reachable.
2. Enable private vulnerability reporting, Dependabot alerts/security updates,
   secret scanning **with push protection**, and code scanning in the repository
   settings.
3. Apply the branch-protection settings listed in
   [`supply-chain.md`](./supply-chain.md#repository-settings-and-branch-protection).

## Quick checks

```bash
npm run audit:prod     # production dependency advisories (high+ fail)
npm run sbom           # CycloneDX SBOM → sbom.json
npm run lint && npm run typecheck && npm test
```

#!/usr/bin/env node
// Dependency override guard.
//
// `overrides` in package.json is a workaround, not a destination. This repo
// carries exactly one:
//
//   @typescript-eslint/typescript-estree > minimatch  ->  ^11.0.1
//
// It exists because of GHSA-g3hv-75wg-m249 / CVE-2026-118764: minimatch
// >=7.0.0 <11.0.1 has a denial-of-service via globparts amplification. The
// upstream chain semver-excludes the fix — every stable typescript-eslint
// release still declares `minimatch: ^10.2.2` — so no version bump can close
// it. Forcing just that one consumer is the narrowest possible fix.
//
// A workaround with no expiry check rots. This script fails the build in three
// directions, so the override can neither disappear silently nor outlive its
// reason:
//
//   1. REOPENED  — a vulnerable minimatch (< the patched version) is installed
//                  anywhere in the tree. This is the actual security gate: it
//                  catches the override being dropped or losing to dedupe.
//   2. NOT APPLIED — the override is declared but the installed copy does not
//                  satisfy it.
//   3. STALE     — the parent now declares a range that already excludes the
//                  vulnerable versions, so the override is dead weight and
//                  must be deleted.
//
// It reads only files on disk (package.json, package-lock.json and the
// installed packages). No network, no npm invocation, no registry lookup, so it
// behaves identically in CI, in a container and offline.
//
// Usage:
//   node scripts/check-dependency-overrides.mjs           # fail on any problem
//   node scripts/check-dependency-overrides.mjs --quiet    # only failures + summary

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const QUIET = process.argv.includes("--quiet");

// ---------------------------------------------------------------------------
// The policy. One entry per override this repo deliberately carries.
//
// `patchedFrom` is the first version that is NOT vulnerable. Keep it in sync
// with the advisory; the guard cannot know an advisory changed.
// ---------------------------------------------------------------------------
const POLICIES = [
  {
    advisory: "GHSA-g3hv-75wg-m249 (CVE-2026-118764)",
    package: "minimatch",
    // Vulnerable range, from the advisory: >=7.0.0 <11.0.1
    vulnerableFrom: "7.0.0",
    patchedFrom: "11.0.1",
    // The single consumer this override targets.
    parent: "@typescript-eslint/typescript-estree",
    overrideRange: "^11.0.1",
  },
];

const problems = [];
const notes = [];

function fail(check, message) {
  problems.push({ check, message });
}

// --- semver, without adding a dependency -----------------------------------
// The repo already depends on semver transitively, but a guard that breaks when
// transitive layout changes is not a guard. These are the only three operations
// needed, implemented on numeric triples.
function parse(version) {
  // Partial versions are legitimate in ranges (`>=11`, `^11.0`), so a missing
  // minor/patch means 0 rather than "unparseable".
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(
    String(version)
      .replace(/^[~^=]/, "")
      .trim()
  );
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function cmp(a, b) {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

function isVulnerable(version, policy) {
  const low = cmp(version, policy.vulnerableFrom);
  const high = cmp(version, policy.patchedFrom);
  if (low === null || high === null) return false;
  return low >= 0 && high < 0;
}

/** Minimal caret/range satisfaction: `^X.Y.Z`, `>=X.Y.Z <A.B.C`, exact, or `*`. */
function satisfies(version, range) {
  const v = parse(version);
  if (!v) return false;
  const clauses = range.trim().split(/\s+/);

  // Bare `*` or `latest` accepts anything.
  if (range.trim() === "*" || range.trim() === "") return true;

  for (const clause of clauses) {
    if (clause.startsWith("^")) {
      const base = parse(clause.slice(1));
      const current = parse(version);
      if (!base || !current) return false;
      if (cmp(version, clause.slice(1)) < 0) return false;
      // Caret pins the leftmost non-zero component.
      if (base[0] !== 0) {
        if (current[0] !== base[0]) return false;
      } else if (base[1] !== 0) {
        if (current[0] !== 0 || current[1] !== base[1]) return false;
      } else {
        if (current[0] !== 0 || current[1] !== 0 || current[2] !== base[2]) return false;
      }
    } else if (clause.startsWith(">=")) {
      if (cmp(version, clause.slice(2)) < 0) return false;
    } else if (clause.startsWith(">")) {
      if (cmp(version, clause.slice(1)) <= 0) return false;
    } else if (clause.startsWith("<=")) {
      if (cmp(version, clause.slice(2)) > 0) return false;
    } else if (clause.startsWith("<")) {
      if (cmp(version, clause.slice(1)) >= 0) return false;
    } else if (clause.startsWith("~")) {
      const base = parse(clause.slice(1));
      const current = parse(version);
      if (!base || !current) return false;
      if (current[0] !== base[0] || current[1] !== base[1]) return false;
      if (cmp(version, clause.slice(1)) < 0) return false;
    } else {
      if (cmp(version, clause) !== 0) return false;
    }
  }
  return true;
}

// --- read the tree ---------------------------------------------------------
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

let pkg;
let lock;
try {
  pkg = readJson("package.json");
} catch (error) {
  console.error(`Cannot read package.json: ${error.message}`);
  process.exit(1);
}
try {
  lock = readJson("package-lock.json");
} catch (error) {
  console.error(`Cannot read package-lock.json: ${error.message}`);
  process.exit(1);
}

const overrides = pkg.overrides ?? {};

// Every installed copy of a package: key -> version, from the lockfile.
function installedCopies(name) {
  const copies = [];
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (key === "") continue;
    const installedName = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    if (installedName !== name) continue;
    if (!entry.version) continue;
    copies.push({ path: key, version: entry.version, dev: Boolean(entry.dev) });
  }
  return copies;
}

// What the installed parent declares as its dependency range.
function declaredRange(parent) {
  for (const [key, entry] of Object.entries(lock.packages ?? {})) {
    if (key === "") continue;
    const installedName = key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length);
    if (installedName !== parent) continue;
    return entry;
  }
  return null;
}

let checked = 0;

for (const policy of POLICIES) {
  checked++;

  // (1) Is any installed copy vulnerable? This is the security-relevant check.
  const copies = installedCopies(policy.package);
  if (copies.length === 0) {
    fail(
      "not-installed",
      `${policy.package} is not present in package-lock.json; the ${policy.advisory} guard cannot be evaluated.`
    );
    continue;
  }

  for (const copy of copies) {
    if (isVulnerable(copy.version, policy)) {
      fail(
        "reopened",
        `${copy.path} has ${policy.package}@${copy.version}, which is inside the vulnerable ` +
          `range >=${policy.vulnerableFrom} <${policy.patchedFrom} for ${policy.advisory}.`
      );
    }
  }

  // (2) Does the override actually apply to the targeted consumer?
  const overrideForParent = overrides[policy.parent];
  const configuredRange =
    typeof overrideForParent === "string" ? overrideForParent : overrideForParent?.[policy.package];

  if (!configuredRange) {
    fail(
      "override-missing",
      `package.json has no overrides entry for ${policy.parent} > ${policy.package}; ` +
        `the ${policy.advisory} fix is not applied.`
    );
    continue;
  }

  const targeted = copies.filter((copy) => copy.path.includes(policy.parent));
  if (targeted.length === 0) {
    fail(
      "override-ineffective",
      `No installed ${policy.parent} copy carries ${policy.package}; the override targets nothing.`
    );
    continue;
  }

  for (const copy of targeted) {
    if (!satisfies(copy.version, configuredRange)) {
      fail(
        "override-ineffective",
        `${copy.path} has ${policy.package}@${copy.version}, which does not satisfy the ` +
          `override \`${configuredRange}\`. The override is not being applied.`
      );
    }
  }

  // (3) Is the override still necessary? If the parent already excludes every
  //     vulnerable version, the override is dead weight and should be removed.
  const parentEntry = declaredRange(policy.parent);
  const parentRange = parentEntry?.dependencies?.[policy.package];
  if (parentRange) {
    // The override is stale when the parent's own range already excludes the
    // vulnerable band, i.e. its floor is at or above the first patched version.
    const floor = parse(parentRange.replace(/^[\^~]/, ""));
    const patched = parse(policy.patchedFrom);
    if (floor && patched) {
      const floorAtOrAbovePatch =
        floor[0] > patched[0] ||
        (floor[0] === patched[0] &&
          (floor[1] > patched[1] || (floor[1] === patched[1] && floor[2] >= patched[2])));
      if (floorAtOrAbovePatch) {
        fail(
          "override-stale",
          `${policy.parent} now declares \`${policy.package}: ${parentRange}\`, which already ` +
            `excludes the vulnerable range. Remove the override from package.json and delete ` +
            `the corresponding POLICIES entry in this script.`
        );
      }
    }
  }

  if (!QUIET) {
    notes.push(
      `${policy.package}: ${copies.map((c) => c.version).join(", ")} installed; ` +
        `override \`${policy.parent} > ${configuredRange}\` applied, ${policy.advisory} closed.`
    );
  }
}

// --- report ---------------------------------------------------------------
for (const note of notes) console.log(`  ${note}`);

if (problems.length > 0) {
  console.error("");
  for (const problem of problems) {
    console.error(`✗ [${problem.check}] ${problem.message}`);
  }
  console.error(`\n✗ dependency override guard: ${problems.length} problem(s)`);
  process.exit(1);
}

if (!QUIET)
  console.log(`\n✓ dependency override guard: ${checked} polic${checked === 1 ? "y" : "ies"} ok`);

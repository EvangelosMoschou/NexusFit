#!/usr/bin/env node
// Documentation drift checker.
//
// A template repo lives or dies by its docs: a documented env var that nothing
// reads, or a documented script that does not exist, sends the next operator
// down a dead end. This script compares what README.md / docs/ claim against
// what the code actually does, so drift is caught before it reaches a reader.
//
// Usage:
//   node scripts/check-docs-drift.mjs            # hard checks fail, soft checks warn
//   node scripts/check-docs-drift.mjs --strict   # warnings also fail (CI target)
//   node scripts/check-docs-drift.mjs --quiet    # only failures + summary
//
// Design rule: a HARD check may only depend on files that the docs lane owns
// (README.md, docs/**, deploy/.env.production.example, package.json scripts) or
// on a claim that only shrinks when code is deleted. Everything that another
// lane can legitimately make stale by ADDING code is a SOFT check, so a
// concurrent feature branch cannot turn this gate red for an unrelated reason.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const QUIET = process.argv.includes("--quiet");

const HARD = [];
const SOFT = [];

function fail(check, message) {
  HARD.push({ check, message });
}
function warn(check, message) {
  SOFT.push({ check, message });
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Recursively collect files under `dir` whose name matches `filter`. */
function walk(dir, filter, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist")
        continue;
      walk(rel, filter, out);
    } else if (filter(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sources of truth
// ---------------------------------------------------------------------------

const readme = read("README.md");

/** Env vars listed in the README "Environment Variables" table. */
function documentedEnvVars() {
  const section = readme.split("## Environment Variables")[1]?.split(/\n## /)[0] ?? "";
  const names = new Set();
  for (const match of section.matchAll(
    /^\|\s*`([A-Z][A-Z0-9_]*)`(?:\s*\/\s*`([A-Z][A-Z0-9_]*)`)?\s*\|/gm
  )) {
    names.add(match[1]);
    if (match[2]) names.add(match[2]);
  }
  return names;
}

// Env vars consumed by the framework, the reverse proxy or the container
// runtime rather than by application code. They are legitimately documented
// even though no `process.env.X` read exists in this repository.
const ENV_CONSUMED_EXTERNALLY = new Set(["PORT", "HOSTNAME", "SITE_DOMAIN"]);
// Runtime/framework internals that are never part of the operator contract.
const ENV_INTERNAL = new Set(["NODE_ENV", "NEXT_RUNTIME", "VERCEL"]);

/** Static `process.env.X` reads across application, CLI and deploy code. */
function codeEnvVars() {
  const files = [
    ...walk("src", (n) => /\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n)),
    ...walk("scripts", (n) => /\.(mjs|js)$/.test(n) && n !== "check-docs-drift.mjs"),
    ...walk("deploy", (n) => /\.(mjs|js|sh|yml|yaml)$/.test(n) || n === "Caddyfile"),
    ...walk("site/src", (n) => /\.(ts|tsx)$/.test(n)),
  ];
  const found = new Map(); // name -> first file that reads it
  for (const file of files) {
    const src = read(file);
    for (const match of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (!found.has(match[1])) found.set(match[1], file);
    }
    for (const match of src.matchAll(/process\.env\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g)) {
      if (!found.has(match[1])) found.set(match[1], file);
    }
    // Dynamic lookup: `process.env[name]` where the name comes from a table of
    // string literals. Treat every UPPER_CASE literal in such a file as a
    // candidate env var so documented timeouts are not reported as unread.
    if (/process\.env\[/.test(src)) {
      for (const match of src.matchAll(/["']([A-Z][A-Z0-9_]{3,})["']/g)) {
        if (!found.has(match[1])) found.set(match[1], file);
      }
    }
  }
  return found;
}

/** `npm run <script>` names mentioned in README (the ones that must exist). */
function documentedScripts() {
  const names = new Set();
  for (const match of readme.matchAll(/npm run ([a-z][\w:-]*)/g)) names.add(match[1]);
  return names;
}

/** `npm <lifecycle>` invocations mentioned in README (test/start/ci/install). */
function documentedLifecycle() {
  const names = new Set();
  for (const match of readme.matchAll(/npm (test|start|ci|install)\b/g)) names.add(match[1]);
  return names;
}

function packageScripts() {
  return new Set(Object.keys(JSON.parse(read("package.json")).scripts ?? {}));
}

/** Variables present in the production env template. */
function envExampleVars() {
  const names = new Set();
  for (const line of read("deploy/.env.production.example").split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line.trim());
    if (match) names.add(match[1]);
  }
  return names;
}

// ---------------------------------------------------------------------------
// HARD checks — docs vs. docs, and docs vs. code that only shrinks
// ---------------------------------------------------------------------------

// 1. A documented env var must actually be read (or be consumed externally).
{
  const documented = documentedEnvVars();
  const code = codeEnvVars();
  for (const name of documented) {
    if (code.has(name) || ENV_CONSUMED_EXTERNALLY.has(name)) continue;
    fail(
      "env-documented-not-read",
      `README documents \`${name}\` but no code reads it. Remove the row or implement it.`
    );
  }
}

// 2. A documented npm script must exist.
{
  const documented = documentedScripts();
  const actual = packageScripts();
  for (const name of documented) {
    if (actual.has(name)) continue;
    fail(
      "script-documented-missing",
      `README documents \`npm run ${name}\` but package.json has no such script.`
    );
  }
}

// 3. Every npm script must be documented (the README script table is the contract).
{
  const documented = new Set([...documentedScripts(), ...documentedLifecycle()]);
  for (const name of packageScripts()) {
    if (documented.has(name)) continue;
    fail(
      "script-undocumented",
      `package.json defines \`${name}\` but README never mentions \`npm run ${name}\`.`
    );
  }
}

// 4. Relative markdown links must resolve.
{
  const files = [
    "README.md",
    "SECURITY.md",
    ...walk("docs", (n) => n.endsWith(".md")),
    ...walk("deploy", (n) => n.endsWith(".md")),
  ];
  for (const file of files) {
    const src = read(file);
    for (const match of src.matchAll(/\]\(([^)\s]+)\)/g)) {
      const link = match[1].split("#")[0];
      if (!link || /^(https?:|mailto:|tel:)/.test(link)) continue;
      const target = path.resolve(path.dirname(path.join(ROOT, file)), link);
      if (!fs.existsSync(target)) {
        fail("link-broken", `${file} links to \`${link}\`, which does not exist.`);
      }
    }
  }
}

// 5. Anything in the production env template must be documented.
{
  const documented = documentedEnvVars();
  for (const name of envExampleVars()) {
    if (documented.has(name)) continue;
    fail(
      "env-example-undocumented",
      `deploy/.env.production.example sets \`${name}\` but the README env table does not document it.`
    );
  }
}

// ---------------------------------------------------------------------------
// SOFT checks — code that exists but the docs have not caught up with yet
// ---------------------------------------------------------------------------

// 6. Code that reads an env var should have it documented.
{
  const documented = documentedEnvVars();
  const code = codeEnvVars();
  for (const [name, file] of code) {
    if (documented.has(name) || ENV_INTERNAL.has(name)) continue;
    warn(
      "env-undocumented",
      `${file} reads \`${name}\` but the README env table does not document it.`
    );
  }
}

// 7. Every src/lib module should appear in the README module map.
//    `src/lib/db/**` is documented as one unit (the storage seam), so its
//    internal split is deliberately not part of the docs contract.
{
  for (const file of walk("src/lib", (n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
    if (file.startsWith(path.join("src/lib/db"))) continue;
    const base = path.basename(file);
    if (readme.includes(base) || readme.includes(path.relative("src/lib", file))) continue;
    warn("lib-module-undocumented", `${file} is not mentioned in the README \`src/lib\` map.`);
  }
}

// 8. Every test file should appear in the README testing section.
{
  for (const file of walk("src", (n) => /\.test\.(ts|tsx)$/.test(n))) {
    if (readme.includes(path.basename(file)) || readme.includes(file)) continue;
    warn("test-undocumented", `${file} is not listed in the README testing section.`);
  }
}

// 9. Every route handler method should appear in the README API tables.
{
  const documented = new Set();
  for (const match of readme.matchAll(/`(GET|POST|PUT|PATCH|DELETE)`\s*\|\s*`([^`]+)`/g)) {
    documented.add(`${match[1]} ${match[2].split("?")[0].replace(/\{id\}/, "[id]")}`);
  }
  for (const file of walk("src/app/api", (n) => n === "route.ts")) {
    const url =
      "/" +
      path
        .relative(path.join(ROOT, "src/app"), path.dirname(path.join(ROOT, file)))
        .split(path.sep)
        .join("/");
    const src = read(file);
    for (const match of src.matchAll(
      /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g
    )) {
      if (documented.has(`${match[1]} ${url}`)) continue;
      warn("route-undocumented", `${match[1]} ${url} (${file}) is not in the README API tables.`);
    }
  }
}

// 10. Every created table should appear in the README data-layer table.
{
  const schema = read("src/lib/sqliteDb.ts");
  for (const match of schema.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?([a-z_]+)/g)) {
    if (readme.includes(`\`${match[1]}\``)) continue;
    warn(
      "table-undocumented",
      `table \`${match[1]}\` is created in src/lib/sqliteDb.ts but not in the README schema table.`
    );
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function group(items) {
  const byCheck = new Map();
  for (const item of items) {
    if (!byCheck.has(item.check)) byCheck.set(item.check, []);
    byCheck.get(item.check).push(item.message);
  }
  return byCheck;
}

const hardByCheck = group(HARD);
const softByCheck = group(SOFT);

if (!QUIET) {
  for (const [check, messages] of hardByCheck) {
    console.log(`\n✖ ${check} (${messages.length})`);
    for (const message of messages) console.log(`    ${message}`);
  }
  for (const [check, messages] of softByCheck) {
    console.log(`\n⚠ ${check} (${messages.length})`);
    for (const message of messages) console.log(`    ${message}`);
  }
}

const failed = HARD.length > 0 || (STRICT && SOFT.length > 0);
console.log(
  `\n${failed ? "✖" : "✓"} docs drift: ${HARD.length} error(s), ${SOFT.length} warning(s)` +
    `${STRICT ? " (strict)" : ""}`
);
process.exit(failed ? 1 : 0);

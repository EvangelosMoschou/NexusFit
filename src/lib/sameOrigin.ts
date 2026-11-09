// CSRF defense-in-depth for mutating API requests.
//
// Session cookies are already `SameSite=Lax`, which keeps a cross-site form or
// fetch from carrying them. This check adds a second, independent barrier: a
// browser attaches an `Origin` header to every state-changing request, so a
// mutating API call whose `Origin` does not match the host that served the page
// did not come from one of our own pages.
//
// The helper is deliberately dependency-free so it can run inside the Next
// proxy (Node.js runtime) as well as in tests.
//
// Policy:
//   * no `Origin` header  -> allow. Non-browser clients (the access scanner,
//     the cron container, curl, uptime checks) do not send `Origin` and rely on
//     their own credentials (cron secret, access key, session cookie).
//   * `Origin: null`      -> reject. It comes from a sandboxed/opaque context.
//   * malformed `Origin`  -> reject (fail closed).
//   * otherwise           -> the `Origin` host must equal the trusted request
//     host, including a non-default port when present.

/** Methods that can change state, and therefore need the origin check. */
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** The slice of the Fetch `Headers` API the helper relies on. */
export interface HeaderReader {
  get(name: string): string | null;
}

export interface OriginCheckRequest {
  method: string;
  headers: HeaderReader;
}

export function isMutatingMethod(method: string | null | undefined): boolean {
  return MUTATING_METHODS.has((method ?? "").toUpperCase());
}

// Which header carries the host the browser actually addressed?
//
// `Host` is the authority the server received, so it is the value the browser
// compared against when it built the `Origin` header — that makes it the only
// trustworthy input here. `x-forwarded-host` is an ordinary request header: a
// caller can set it, and if we preferred it a cross-origin POST could choose
// the value this guard compares against. So it is a fallback only, used when
// `Host` is missing entirely.
//
// A reverse proxy that rewrites `Host` must therefore preserve the original
// one (Caddy does by default, and it is the proxy this repo ships). When it
// does, `Host` and `x-forwarded-host` agree and the fallback never runs.
//
// The fallback takes the right-most entry of a chain, matching the
// proxy-appends model documented for `x-forwarded-for` in `rateLimit.ts`.
export function trustedHostFromHeaders(headers: HeaderReader): string {
  const host = (headers.get("host") ?? "").trim();
  if (host) return host.toLowerCase();

  const forwarded = headers.get("x-forwarded-host");
  if (!forwarded) return "";
  const hops = forwarded
    .split(",")
    .map((hop) => hop.trim())
    .filter(Boolean);
  return (hops[hops.length - 1] ?? "").toLowerCase();
}

// Returns true when the request may proceed. Non-mutating methods are not
// origin-checked: a cross-site GET cannot change state and is handled by the
// SameSite cookie policy.
export function isSameOriginRequest(req: OriginCheckRequest): boolean {
  if (!isMutatingMethod(req.method)) return true;

  const origin = req.headers.get("origin");
  // No Origin header: server-to-server call, not a browser cross-site request.
  if (origin === null) return true;

  const trustedHost = trustedHostFromHeaders(req.headers);
  // Without a trusted host there is nothing to compare against; fail closed.
  if (!trustedHost) return false;

  let originHost: string;
  try {
    const url = new URL(origin);
    // `Origin: null` and other non-http(s) values never match a web host.
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    originHost = url.host.toLowerCase();
  } catch {
    // Malformed values (including the literal "null") throw: reject.
    return false;
  }

  return originHost !== "" && originHost === trustedHost;
}

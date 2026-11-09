// Shared cookie helpers.
//
// Session cookies must carry the `Secure` attribute in production so they are
// never transmitted over plain HTTP. Local development is served over
// http://localhost, so the flag is omitted there to keep the flows testable.
export const SECURE_COOKIES = process.env.NODE_ENV === "production";

// Production session cookies use the `__Host-` prefix. Browsers enforce it:
// such a cookie must be set over HTTPS with `Secure`, `Path=/` and no `Domain`
// attribute, and it cannot be overwritten by a sibling subdomain. That closes
// cookie-fixation/overwrite paths that a per-tenant subdomain would otherwise
// open. Development and tests keep the plain names, because the prefix is
// rejected over http://localhost.
const COOKIE_PREFIX = SECURE_COOKIES ? "__Host-" : "";

// Default lifetime of a staff/admin session (8 hours). The member cookie is
// longer lived and is configured where it is issued.
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 28800;

// Signed member session cookie (see src/lib/session.ts).
export const MEMBER_COOKIE = `${COOKIE_PREFIX}nexusfit_member_id`;

// Legacy admin session cookie (ADMIN_PASSWORD). Kept next to the other session
// cookies so every cookie name follows the same prefix policy; adminAuth
// re-exports it for existing imports.
export const ADMIN_COOKIE = `${COOKIE_PREFIX}nexusfit_admin`;

// Legacy shared trainer cookie (TRAINER_PASSWORD).
export const TRAINER_COOKIE = `${COOKIE_PREFIX}nexusfit_trainer`;

// Signed session cookie for staff accounts (admins and trainers). The account
// row is checked on every request, so deleting or deactivating it invalidates
// the cookie immediately.
export const STAFF_COOKIE = `${COOKIE_PREFIX}nexusfit_staff`;

// Serialises a session cookie. This is the single place that decides the
// attributes, so every Set-Cookie string keeps what `__Host-` requires:
// `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` in production and no `Domain`.
export function buildSessionCookie(
  name: string,
  value: string,
  maxAgeSeconds: number = DEFAULT_SESSION_MAX_AGE_SECONDS
): string {
  const secure = SECURE_COOKIES ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

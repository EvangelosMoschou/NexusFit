// Shared cookie helpers.
//
// Session cookies must carry the `Secure` attribute in production so they are
// never transmitted over plain HTTP. Local development is served over
// http://localhost, so the flag is omitted there to keep the flows testable.
export const SECURE_COOKIES = process.env.NODE_ENV === "production";

// Signed member session cookie (see src/lib/session.ts).
export const MEMBER_COOKIE = "nexusfit_member_id";

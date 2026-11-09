import { describe, expect, it } from "vitest";
import {
  isMutatingMethod,
  isSameOriginRequest,
  trustedHostFromHeaders,
  type OriginCheckRequest,
} from "./sameOrigin";

const makeRequest = (method: string, headers: Record<string, string> = {}): OriginCheckRequest => ({
  method,
  headers: new Headers(headers),
});

describe("isMutatingMethod", () => {
  it("recognises state-changing methods regardless of case", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post", "Delete"]) {
      expect(isMutatingMethod(method)).toBe(true);
    }
  });

  it("ignores read-only and missing methods", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get", "", null, undefined]) {
      expect(isMutatingMethod(method)).toBe(false);
    }
  });
});

describe("trustedHostFromHeaders", () => {
  it("prefers host over x-forwarded-host", () => {
    expect(
      trustedHostFromHeaders(
        new Headers({
          "x-forwarded-host": "gym.example, proxy.internal:8080",
          host: "nexusfit_app:3000",
        })
      )
    ).toBe("nexusfit_app:3000");
  });

  it("ignores a client-supplied x-forwarded-host when host is present", () => {
    // The browser cannot set `host`, but it can set `x-forwarded-host` on a
    // non-simple request. Preferring `host` keeps the guard's comparison value
    // out of the caller's reach.
    expect(
      trustedHostFromHeaders(
        new Headers({ "x-forwarded-host": "evil.example", host: "gym.example" })
      )
    ).toBe("gym.example");
  });

  it("falls back to the right-most x-forwarded-host entry when host is absent", () => {
    expect(
      trustedHostFromHeaders(
        new Headers({ "x-forwarded-host": "gym.example, proxy.internal:8080" })
      )
    ).toBe("proxy.internal:8080");
  });

  it("falls back to host when x-forwarded-host is absent or blank", () => {
    expect(trustedHostFromHeaders(new Headers({ host: "localhost:3000" }))).toBe("localhost:3000");
    expect(
      trustedHostFromHeaders(new Headers({ "x-forwarded-host": "  ", host: "gym.example" }))
    ).toBe("gym.example");
  });

  it("returns an empty string when neither header is present", () => {
    expect(trustedHostFromHeaders(new Headers())).toBe("");
  });
});

describe("isSameOriginRequest", () => {
  it("allows a mutating request whose Origin matches the host", () => {
    expect(
      isSameOriginRequest(
        makeRequest("POST", {
          origin: "https://gym.example",
          "x-forwarded-host": "gym.example",
        })
      )
    ).toBe(true);
  });

  it("allows a same-origin request that falls back to the host header", () => {
    expect(
      isSameOriginRequest(
        makeRequest("DELETE", { origin: "http://localhost:3000", host: "localhost:3000" })
      )
    ).toBe(true);
  });

  it("includes the port when comparing", () => {
    expect(
      isSameOriginRequest(
        makeRequest("PATCH", { origin: "http://localhost:3000", host: "localhost:3000" })
      )
    ).toBe(true);
    expect(
      isSameOriginRequest(
        makeRequest("PATCH", { origin: "http://localhost:3000", host: "localhost:4000" })
      )
    ).toBe(false);
  });

  it("rejects a different host", () => {
    expect(
      isSameOriginRequest(
        makeRequest("POST", {
          origin: "https://evil.example",
          "x-forwarded-host": "gym.example",
        })
      )
    ).toBe(false);
  });

  it("rejects a lookalike subdomain", () => {
    expect(
      isSameOriginRequest(
        makeRequest("POST", {
          origin: "https://evil.gym.example",
          "x-forwarded-host": "gym.example",
        })
      )
    ).toBe(false);
  });

  it("allows requests with no Origin header (server-to-server clients)", () => {
    expect(
      isSameOriginRequest(
        makeRequest("POST", { "x-forwarded-host": "gym.example", "x-cron-secret": "x" })
      )
    ).toBe(true);
  });

  it("rejects Origin: null", () => {
    expect(
      isSameOriginRequest(
        makeRequest("POST", { origin: "null", "x-forwarded-host": "gym.example" })
      )
    ).toBe(false);
  });

  it("rejects malformed and empty Origin values", () => {
    for (const origin of ["gym.example", "://nope", "not a url", "", "javascript:alert(1)"]) {
      expect(
        isSameOriginRequest(makeRequest("POST", { origin, "x-forwarded-host": "gym.example" }))
      ).toBe(false);
    }
  });

  it("rejects when no trusted host header is available", () => {
    expect(isSameOriginRequest(makeRequest("POST", { origin: "https://gym.example" }))).toBe(false);
  });

  it("rejects a cross-origin request that spoofs x-forwarded-host", () => {
    // Regression: the guard used to read the first x-forwarded-host entry, which
    // a caller controls, so this pair was accepted and the CSRF barrier was
    // bypassed. `host` is authoritative now.
    expect(
      isSameOriginRequest(
        makeRequest("POST", {
          origin: "https://evil.example",
          "x-forwarded-host": "evil.example, gym.example",
        })
      )
    ).toBe(false);
    expect(
      isSameOriginRequest(
        makeRequest("POST", {
          origin: "https://evil.example",
          host: "gym.example",
          "x-forwarded-host": "evil.example",
        })
      )
    ).toBe(false);
  });

  it("rejects a proxy that rewrites Host to an internal name", () => {
    // A proxy must preserve the original Host (Caddy does by default). If it
    // rewrites it, the guard cannot tell the public host from an attacker's and
    // fails closed rather than trusting a client-settable header.
    expect(
      isSameOriginRequest(
        makeRequest("POST", {
          origin: "https://gym.example",
          "x-forwarded-host": "gym.example, proxy.internal:8080",
          host: "nexusfit_app:3000",
        })
      )
    ).toBe(false);
  });

  it("compares hosts case-insensitively", () => {
    expect(
      isSameOriginRequest(
        makeRequest("POST", { origin: "https://GYM.Example", host: "gym.example" })
      )
    ).toBe(true);
  });

  it("does not check read-only methods", () => {
    expect(
      isSameOriginRequest(
        makeRequest("GET", { origin: "https://evil.example", host: "gym.example" })
      )
    ).toBe(true);
  });
});

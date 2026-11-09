import path from "node:path";
import type { NextConfig } from "next";

// Enforced partial CSP.
//
// Only directives that cannot break Next's inline bootstrap/hydration scripts
// are enabled here. A full script-src policy needs per-request nonces and is a
// separate follow-up. These four directives do not restrict subresources:
//   * base-uri 'self'      - no external <base> hijack
//   * form-action 'self'   - forms cannot post credentials off-site
//   * frame-ancestors none - the app cannot be framed (supersedes X-Frame-Options
//                            in CSP-capable browsers); it governs who may embed
//                            *this* page, not the OSM iframe this page embeds
//   * object-src 'none'    - no <object>/<embed> plugins
const contentSecurityPolicy = [
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "off",
  },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy,
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
];

const nextConfig: NextConfig = {
  output: "standalone", // Bundles a minimal standalone production Node.js server
  // Without this, Next walks up looking for a lockfile and can pick a parent
  // directory as the workspace root, nesting the standalone output under it.
  outputFileTracingRoot: path.resolve(__dirname),
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true, // Enable Brotli/Gzip compression
  compiler: {
    // Strip the noisy console.log/debug/info in production, but KEEP error and
    // warn: they are the only signal we get from server-side failures (e.g. the
    // sqliteDb error paths), and stripping them made production failures silent.
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"], // Tree-shake Lucide icons down to exact SVGs
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

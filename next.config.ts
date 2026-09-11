import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=()" },
      // These enforced directives do not constrain map tiles, fonts or blob workers.
      { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'" },
      // Script policy is observed first: Next hydration/export currently use inline code.
      { key: "Content-Security-Policy-Report-Only", value: "script-src 'self'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
  images: {
    // Seul le logo statique utilise next/image. Ne jamais optimiser les images
    // de publications (y compris celles déjà enregistrées) ou les routes API.
    localPatterns: [{ pathname: "/dromap-logo-mark-crop.png", search: "" }],
    remotePatterns: [],
  },
  async redirects() {
    return [
      {
        source: "/editor/test",
        destination: "/editor",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

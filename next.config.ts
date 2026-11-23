import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // `pg` uses optional native bindings; keep it out of the server bundle.
  serverExternalPackages: ["pg"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.esawebb.org" },
      { protocol: "https", hostname: "mast.stsci.edu", pathname: "/portal/Download/file" },
    ],
    // MAST previews can be 14k px wide; give the optimizer room.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    qualities: [60, 75, 85, 90],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

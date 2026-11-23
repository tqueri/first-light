import type { VercelConfig } from "@vercel/config/v1";

// Vercel infers pnpm 9/10 from a v9 lockfile, but this project is pnpm 11
// (`packageManager` + `allowBuilds` in pnpm-workspace.yaml), so run the pinned version explicitly.
// These two must stay plain string literals: Vercel rejects computed values in static properties.
export const config: VercelConfig = {
  framework: "nextjs",
  installCommand: "npx --yes pnpm@11.3.0 install --frozen-lockfile",
  buildCommand: "npx --yes pnpm@11.3.0 run build",
  // Daily archive refresh (MAST + ESA/Webb; exoplanet spectra on Mondays). Requires CRON_SECRET.
  crons: [{ path: "/api/cron/refresh", schedule: "30 6 * * *" }],
};

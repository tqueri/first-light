import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm build",
  // Daily archive refresh (MAST + ESA/Webb; exoplanet spectra on Mondays). Requires CRON_SECRET.
  crons: [{ path: "/api/cron/refresh", schedule: "30 6 * * *" }],
};

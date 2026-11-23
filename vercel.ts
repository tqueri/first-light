import type { VercelConfig } from "@vercel/config/v1";

// Vercel infers pnpm 9/10 from a v9 lockfile, but this project is pnpm 11
// (`packageManager` + `allowBuilds` in pnpm-workspace.yaml). Run the pinned version explicitly
// so no dashboard setting (ENABLE_EXPERIMENTAL_COREPACK) is needed.
const PNPM = "npx --yes pnpm@11.3.0";

export const config: VercelConfig = {
  framework: "nextjs",
  installCommand: `${PNPM} install --frozen-lockfile`,
  buildCommand: `${PNPM} run build`,
  // Daily archive refresh (MAST + ESA/Webb; exoplanet spectra on Mondays). Requires CRON_SECRET.
  crons: [{ path: "/api/cron/refresh", schedule: "30 6 * * *" }],
};

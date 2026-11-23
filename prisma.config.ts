import fs from "node:fs";
import { defineConfig } from "prisma/config";

// Prisma 7 does not read .env files itself. Load them the same way Next does (.env.local wins).
for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations want a direct connection: Vercel's Neon integration also sets POSTGRES_URL_NON_POOLING
  // (POSTGRES_URL there goes through a pooler). Optional so `prisma generate` works without a database.
  datasource: { url: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL },
});

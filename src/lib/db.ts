import { Pool, type QueryResultRow } from "pg";

// One pool per process (survives HMR in dev).
const g = globalThis as unknown as { __firstLightPool?: Pool };

export function pool(): Pool {
  if (!g.__firstLightPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Locally, run `pnpm dev` (it boots an embedded Postgres); in production, connect a Postgres (e.g. Neon via the Vercel Marketplace).",
      );
    }
    g.__firstLightPool = new Pool({ connectionString, max: 6, idleTimeoutMillis: 10_000 });
  }
  return g.__firstLightPool;
}

export async function sql<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * The single database seam: a Prisma client (one per process, survives HMR in dev).
 * POSTGRES_URL comes from .env locally (the embedded Postgres booted by `pnpm dev`)
 * and from the project's environment variables on Vercel.
 */
const g = globalThis as unknown as { __firstLightPrisma?: PrismaClient };

export function db(): PrismaClient {
  if (!g.__firstLightPrisma) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        "POSTGRES_URL is not set. Locally it lives in .env (`pnpm dev` boots the embedded Postgres it points to); on Vercel, add it to the project's environment variables.",
      );
    }
    // NB: @prisma/adapter-pg assumes UTC sessions (it replaces the offset of every timestamptz it reads
    // with +00:00). Hosted Postgres defaults to UTC; migration 2_utc_timezone and the embedded server's
    // `timezone=UTC` flag make sure ours does too, otherwise every date would silently shift by hours.
    g.__firstLightPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString, max: 6, idleTimeoutMillis: 10_000 }),
    });
  }
  return g.__firstLightPrisma;
}

/**
 * Prisma returns int8 as BigInt and numeric as Decimal in raw results. The analytical queries were
 * written against node-postgres, which returns both as strings (they cast to ::int / ::float8 where a
 * number is wanted), so keep that contract: BigInt/Decimal → string. BigInt also can't go through JSON.
 */
function normalize(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v === null || typeof v !== "object" || v instanceof Date) return v;
  if (Array.isArray(v)) return v.map(normalize);
  if (Prisma.Decimal.isDecimal(v)) return v.toFixed();
  if (Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = normalize(x);
    return out;
  }
  return v;
}

/**
 * Hand-written analytical SQL (trigonometry, window functions, percentiles…) that the Prisma
 * query builder can't express. Always parameterised: values go in `params` ($1, $2…), never in `text`.
 */
export async function sql<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const rows = await db().$queryRawUnsafe<unknown[]>(text, ...params);
  return rows.map((r) => normalize(r) as T);
}

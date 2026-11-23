/**
 * Runs a command with a Postgres available at POSTGRES_URL.
 *
 * - POSTGRES_URL comes from .env.local / .env (default: the local embedded Postgres).
 * - If it points at the embedded Postgres (127.0.0.1:54329), that server is booted from
 *   ./.data/pg, or reused if another `with-db` process already started it.
 * - Any other URL (Neon, Prisma Postgres…) is used as-is.
 * - Prisma migrations are applied (`prisma migrate deploy`) before the command runs.
 *
 *   tsx scripts/with-db.mts next dev
 */
import EmbeddedPostgres from "embedded-postgres";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";

const PORT = 54329;
const DB = "firstlight";
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".data", "pg");
const LOCAL_URL = `postgresql://postgres:postgres@127.0.0.1:${PORT}/${DB}`;

for (const f of [".env.local", ".env"]) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) process.loadEnvFile(p);
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, "127.0.0.1");
    s.once("connect", () => {
      s.end();
      resolve(true);
    });
    s.once("error", () => resolve(false));
  });
}

function isEmbedded(url: string) {
  const u = new URL(url);
  return ["127.0.0.1", "localhost"].includes(u.hostname) && Number(u.port) === PORT;
}

async function bootEmbedded(): Promise<EmbeddedPostgres | null> {
  if (await portOpen(PORT)) {
    console.log(`[db] reusing embedded Postgres already running on :${PORT}`);
    return null;
  }
  const instance = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: "postgres",
    password: "postgres",
    port: PORT,
    persistent: true,
    // Windows defaults to WIN1252; force UTF-8 (μm, Greek letters, accented names…).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    // initdb copies the OS time zone (America/New_York here); Prisma's pg adapter needs UTC sessions.
    postgresFlags: ["-c", "timezone=UTC"],
    onLog: () => {},
    onError: () => {},
  });
  if (!fs.existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log("[db] initialising embedded Postgres in .data/pg …");
    await instance.initialise();
  }
  try {
    await instance.start();
  } catch (err) {
    // A crashed previous run can leave a stale lock file behind.
    const pid = path.join(DATA_DIR, "postmaster.pid");
    if (fs.existsSync(pid)) {
      console.warn("[db] removing stale postmaster.pid and retrying");
      fs.rmSync(pid);
      await instance.start();
    } else throw err;
  }
  const admin = new pg.Client({ connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres` });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [DB]);
  if (exists.rowCount === 0) {
    await admin.query(`create database ${DB} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`);
  }
  await admin.end();
  console.log(`[db] embedded Postgres ready on :${PORT}`);
  return instance;
}

function prisma(args: string[], url: string) {
  const r = spawnSync(`prisma ${args.join(" ")}`, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, POSTGRES_URL: url },
  });
  if (r.status !== 0) throw new Error(`prisma ${args.join(" ")} failed (exit ${r.status})`);
}

/** Apply Prisma migrations. A database created by the old db/schema.sql is baselined first, not recreated. */
async function migrate(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ legacy: boolean; prisma: boolean }>(
    `select to_regclass('public.products') is not null as legacy, to_regclass('public._prisma_migrations') is not null as prisma`,
  );
  await client.end();
  if (rows[0].legacy && !rows[0].prisma) {
    console.log("[db] existing schema without Prisma history: marking 0_init as applied (no data touched)");
    prisma(["migrate", "resolve", "--applied", "0_init"], url);
  }
  prisma(["migrate", "deploy"], url);
}

const [cmd, ...args] = process.argv.slice(2);
const url = process.env.POSTGRES_URL || LOCAL_URL;
const instance = isEmbedded(url) ? await bootEmbedded() : null;
await migrate(url);

let stopping = false;
async function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  if (instance) {
    try {
      await instance.stop();
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
}

if (!cmd) {
  console.log("[db] migrations applied. Holding Postgres open — Ctrl+C to stop.");
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  setInterval(() => {}, 1 << 30);
} else {
  const child = spawn([cmd, ...args].join(" "), {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, POSTGRES_URL: url },
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code) => shutdown(code ?? 0));
}

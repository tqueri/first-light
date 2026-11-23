/**
 * Runs a command with a Postgres available at DATABASE_URL.
 *
 * - If DATABASE_URL is set (e.g. Neon in .env.local), it is used as-is.
 * - Otherwise an embedded Postgres is booted from ./.data/pg (or reused if
 *   another `with-db` process already started it).
 * - The schema is applied (idempotent) before the command runs.
 *
 *   tsx scripts/with-db.mts next dev
 */
import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";

const PORT = 54329;
const DB = "firstlight";
const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, ".data", "pg");

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
  const admin = new pg.Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres` });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [DB]);
  if (exists.rowCount === 0) {
    await admin.query(`create database ${DB} encoding 'UTF8' lc_collate 'C' lc_ctype 'C' template template0`);
  }
  await admin.end();
  console.log(`[db] embedded Postgres ready on :${PORT}`);
  return instance;
}

async function migrate(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(fs.readFileSync(path.join(ROOT, "db", "schema.sql"), "utf8"));
  await client.end();
}

const [cmd, ...args] = process.argv.slice(2);
let instance: EmbeddedPostgres | null = null;
let url = process.env.DATABASE_URL;
if (!url) {
  instance = await bootEmbedded();
  url = `postgres://postgres:postgres@127.0.0.1:${PORT}/${DB}`;
}
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
  console.log("[db] schema applied. Holding Postgres open — Ctrl+C to stop.");
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  setInterval(() => {}, 1 << 30);
} else {
  const child = spawn([cmd, ...args].join(" "), {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: url },
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code) => shutdown(code ?? 0));
}

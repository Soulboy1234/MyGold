import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_FILE = path.join(DATA_DIR, "highres.db");
const BACKFILL_DB_FILE = path.join(DATA_DIR, "highres-backfill.db");
const AUX_SNAPSHOT_DB_FILE = path.join(DATA_DIR, "highres-aux-snapshot.db");
const SUMMARY_FILE = path.join(DATA_DIR, "highres-summary.json");
const TROY_OUNCE_TO_GRAMS = 31.1034768;

await mkdir(DATA_DIR, { recursive: true });

if (!fs.existsSync(BACKFILL_DB_FILE)) {
  throw new Error(`Backfill database not found: ${BACKFILL_DB_FILE}`);
}

if (fs.existsSync(DB_FILE)) {
  fs.copyFileSync(DB_FILE, AUX_SNAPSHOT_DB_FILE);
}

const db = new DatabaseSync(DB_FILE);
try {
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");

  attachDatabase(db, BACKFILL_DB_FILE, "backfill");
  if (fs.existsSync(AUX_SNAPSHOT_DB_FILE)) {
    attachDatabase(db, AUX_SNAPSHOT_DB_FILE, "oldsync");
  }

  db.exec(`
    DROP TABLE IF EXISTS intraday_history_next;
    CREATE TABLE intraday_history_next (
      timestamp_utc INTEGER PRIMARY KEY,
      timestamp_local TEXT NOT NULL,
      granularity TEXT,
      price_source TEXT,
      price_usd_per_oz REAL,
      price_cny_per_gram REAL,
      usd_cny_rate REAL,
      gc_front_close REAL,
      gc_front_volume INTEGER,
      gld_close REAL,
      gld_volume INTEGER,
      uup_close REAL,
      uup_volume INTEGER,
      fx_carried_forward INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  const updatedAt = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(`
      INSERT INTO intraday_history_next (
        timestamp_utc,
        timestamp_local,
        granularity,
        price_source,
        price_usd_per_oz,
        price_cny_per_gram,
        usd_cny_rate,
        gc_front_close,
        gc_front_volume,
        gld_close,
        gld_volume,
        uup_close,
        uup_volume,
        fx_carried_forward,
        updated_at
      )
      WITH gold_rows AS (
        SELECT
          timestamp_utc,
          timestamp_local,
          granularity,
          close,
          source_label
        FROM backfill.source_bars
        WHERE series_key = 'gold'
        ORDER BY timestamp_utc ASC
      ),
      enriched AS (
        SELECT
          g.timestamp_utc,
          g.timestamp_local,
          g.granularity,
          g.source_label,
          g.close AS price_usd_per_oz,
          (
            SELECT fx.close
            FROM backfill.source_bars AS fx
            WHERE fx.series_key = 'usdCnyRate'
              AND fx.timestamp_utc <= g.timestamp_utc
            ORDER BY fx.timestamp_utc DESC
            LIMIT 1
          ) AS usd_cny_rate,
          (
            SELECT fx.timestamp_utc
            FROM backfill.source_bars AS fx
            WHERE fx.series_key = 'usdCnyRate'
              AND fx.timestamp_utc <= g.timestamp_utc
            ORDER BY fx.timestamp_utc DESC
            LIMIT 1
          ) AS fx_timestamp_utc
        FROM gold_rows AS g
      )
      SELECT
        e.timestamp_utc,
        e.timestamp_local,
        e.granularity,
        e.source_label,
        e.price_usd_per_oz,
        CASE
          WHEN e.price_usd_per_oz IS NOT NULL AND e.usd_cny_rate IS NOT NULL
            THEN ROUND((e.price_usd_per_oz * e.usd_cny_rate) / ?, 4)
          ELSE NULL
        END AS price_cny_per_gram,
        e.usd_cny_rate,
        old.gc_front_close,
        old.gc_front_volume,
        old.gld_close,
        old.gld_volume,
        old.uup_close,
        old.uup_volume,
        CASE
          WHEN e.fx_timestamp_utc IS NOT NULL AND e.fx_timestamp_utc < e.timestamp_utc THEN 1
          ELSE 0
        END AS fx_carried_forward,
        ? AS updated_at
      FROM enriched AS e
      LEFT JOIN oldsync.intraday_history AS old
        ON old.timestamp_utc = e.timestamp_utc
      ORDER BY e.timestamp_utc ASC
    `).run(TROY_OUNCE_TO_GRAMS, updatedAt);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  db.exec(`
    DROP TABLE IF EXISTS intraday_history;
    ALTER TABLE intraday_history_next RENAME TO intraday_history;
  `);

  const summary = buildSummary(db);
  const backfillSummary = await readJsonIfExists(path.join(DATA_DIR, "highres-backfill-summary.json"));
  const previousSummary = await readJsonIfExists(SUMMARY_FILE);
  const outputSummary = {
    updatedAt,
    rebuildMode: "direct-backfill-core",
    rowCount: summary.rowCount,
    startTime: summary.startTime,
    endTime: summary.endTime,
    backfill: backfillSummary,
    previousSummary: previousSummary ?? null,
  };
  await writeFile(SUMMARY_FILE, JSON.stringify(outputSummary, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(outputSummary, null, 2));
} finally {
  tryDetach(db, "oldsync");
  tryDetach(db, "backfill");
  db.close();
}

function attachDatabase(db, filePath, alias) {
  const normalized = filePath.replace(/\\/g, "/").replace(/'/g, "''");
  db.exec(`ATTACH DATABASE '${normalized}' AS ${alias};`);
}

function tryDetach(db, alias) {
  try {
    db.exec(`DETACH DATABASE ${alias};`);
  } catch {
  }
}

function buildSummary(db) {
  return db.prepare(`
    SELECT
      COUNT(*) AS rowCount,
      MIN(timestamp_local) AS startTime,
      MAX(timestamp_local) AS endTime
    FROM intraday_history
  `).get();
}

async function readJsonIfExists(filePath) {
  try {
    const content = await readFile(filePath, "utf8");
    return JSON.parse(String(content).replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

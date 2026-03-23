import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { getHistoricalRates } from "dukascopy-node";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT_DIR, "data");
const BACKFILL_DB_FILE = path.join(DATA_DIR, "highres-backfill.db");
const SUMMARY_FILE = path.join(DATA_DIR, "highres-backfill-summary.json");

const RMB_HIGHRES_START_UTC = new Date("2012-06-27T00:00:00Z");
const FIVE_MIN_START_UTC = new Date("2012-06-27T00:00:00Z");
const RECENT_REFRESH_LOOKBACK_DAYS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const SERIES_CONFIG = [
  {
    key: "gold",
    instrument: "xauusd",
    label: "Dukascopy XAUUSD",
  },
  {
    key: "usdCnyRate",
    instrument: "usdcnh",
    label: "Dukascopy USDCNH",
  },
];
const REQUESTED_SERIES = new Set(
  String(process.env.DUKASCOPY_SERIES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

export async function loadDukascopyBackfill(dataDir = DATA_DIR) {
  await mkdir(dataDir, { recursive: true });
  const dbPath = dataDir === DATA_DIR ? BACKFILL_DB_FILE : path.join(dataDir, "highres-backfill.db");
  const summaryPath = dataDir === DATA_DIR ? SUMMARY_FILE : path.join(dataDir, "highres-backfill-summary.json");
  const db = new DatabaseSync(dbPath);

  try {
    ensureSchema(db);

    for (const series of SERIES_CONFIG) {
      if (REQUESTED_SERIES.size && !REQUESTED_SERIES.has(series.key)) {
        continue;
      }
      const hasRows = db.prepare(`
        SELECT COUNT(*) AS count
        FROM source_bars
        WHERE series_key = ?
      `).get(series.key)?.count > 0;

      if (!hasRows) {
        await seedSeries(db, series);
      } else {
        await ensureFiveMinuteCoverage(db, series);
      }

      await refreshRecentFiveMinuteTail(db, series);
    }

    const goldRows = loadSeriesRows(db, "gold");
    const fxRows = loadSeriesRows(db, "usdCnyRate");
    const summary = buildSummary(db);
    await writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

    return {
      goldRows,
      fxRows,
      meta: summary,
    };
  } finally {
    db.close();
  }
}

if (process.argv[1] === __filename) {
  const result = await loadDukascopyBackfill();
  console.log(JSON.stringify(result.meta, null, 2));
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS source_bars (
      series_key TEXT NOT NULL,
      timestamp_utc INTEGER NOT NULL,
      timestamp_local TEXT NOT NULL,
      granularity TEXT NOT NULL,
      close REAL,
      source_label TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(series_key, timestamp_utc)
    );
    CREATE INDEX IF NOT EXISTS idx_source_bars_key_time
    ON source_bars(series_key, timestamp_utc);
  `);
}

async function seedSeries(db, series) {
  const now = new Date();
  await syncRangeInChunks(db, {
    ...series,
    timeframe: "m5",
    from: FIVE_MIN_START_UTC,
    to: now,
    chunkDays: 60,
  });
}

async function ensureFiveMinuteCoverage(db, series) {
  const firstFiveMinuteRow = db.prepare(`
    SELECT timestamp_utc AS timestampUtc
    FROM source_bars
    WHERE series_key = ?
      AND granularity = 'm5'
    ORDER BY timestamp_utc ASC
    LIMIT 1
  `).get(series.key);

  const firstFiveMinuteMs = Number.isFinite(Number(firstFiveMinuteRow?.timestampUtc))
    ? Number(firstFiveMinuteRow.timestampUtc) * 1000
    : null;
  const nonFiveMinuteCoverage = db.prepare(`
    SELECT
      MIN(timestamp_utc) AS firstNonFiveMinuteUtc,
      MAX(timestamp_utc) AS lastNonFiveMinuteUtc
    FROM source_bars
    WHERE series_key = ?
      AND timestamp_utc >= ?
      AND granularity <> 'm5'
  `).get(series.key, Math.floor(FIVE_MIN_START_UTC.getTime() / 1000));

  const firstNonFiveMinuteMs = Number.isFinite(Number(nonFiveMinuteCoverage?.firstNonFiveMinuteUtc))
    ? Number(nonFiveMinuteCoverage.firstNonFiveMinuteUtc) * 1000
    : null;
  const lastNonFiveMinuteMs = Number.isFinite(Number(nonFiveMinuteCoverage?.lastNonFiveMinuteUtc))
    ? Number(nonFiveMinuteCoverage.lastNonFiveMinuteUtc) * 1000
    : null;

  if (
    firstFiveMinuteMs !== null
    && firstFiveMinuteMs <= FIVE_MIN_START_UTC.getTime()
    && firstNonFiveMinuteMs === null
  ) {
    return;
  }

  const coverageStartMs = firstNonFiveMinuteMs !== null
    ? firstNonFiveMinuteMs
    : FIVE_MIN_START_UTC.getTime();
  const coverageEnd = firstNonFiveMinuteMs !== null && lastNonFiveMinuteMs !== null
    ? new Date(lastNonFiveMinuteMs)
    : firstFiveMinuteMs !== null
      ? new Date(firstFiveMinuteMs - 1)
      : new Date();

  await syncRangeInChunks(db, {
    ...series,
    timeframe: "m5",
    from: new Date(coverageStartMs),
    to: coverageEnd,
    chunkDays: 60,
  });
}

async function refreshRecentFiveMinuteTail(db, series) {
  const lastRow = db.prepare(`
    SELECT timestamp_utc AS timestampUtc
    FROM source_bars
    WHERE series_key = ?
      AND granularity = 'm5'
    ORDER BY timestamp_utc DESC
    LIMIT 1
  `).get(series.key);

  const lastTimestampMs = Number.isFinite(Number(lastRow?.timestampUtc))
    ? Number(lastRow.timestampUtc) * 1000
    : null;
  const nowMs = Date.now();
  const from = lastTimestampMs
    ? new Date(lastTimestampMs < nowMs - 3 * DAY_MS
      ? Math.max(FIVE_MIN_START_UTC.getTime(), lastTimestampMs + 1)
      : Math.max(FIVE_MIN_START_UTC.getTime(), lastTimestampMs - RECENT_REFRESH_LOOKBACK_DAYS * DAY_MS))
    : FIVE_MIN_START_UTC;
  const to = new Date();

  await syncRangeInChunks(db, {
    ...series,
    timeframe: "m5",
    from,
    to,
    chunkDays: 45,
  });
}

async function syncRangeInChunks(db, { key, instrument, label, timeframe, from, to, chunkDays }) {
  const ranges = buildRanges(from, to, chunkDays);
  const insert = db.prepare(`
    INSERT INTO source_bars (
      series_key,
      timestamp_utc,
      timestamp_local,
      granularity,
      close,
      source_label,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(series_key, timestamp_utc) DO UPDATE SET
      timestamp_local = excluded.timestamp_local,
      granularity = excluded.granularity,
      close = excluded.close,
      source_label = excluded.source_label,
      updated_at = excluded.updated_at
  `);

  for (const range of ranges) {
    console.log(`[dukascopy] ${key} ${timeframe} ${range.from.toISOString().slice(0, 10)} -> ${range.to.toISOString().slice(0, 10)}`);
    const rows = await fetchHistoricalRatesWithRetry({
      instrument,
      dates: {
        from: range.from,
        to: range.to,
      },
      timeframe,
    });
    const normalizedRows = normalizeRates(rows);

    if (!normalizedRows.length) {
      continue;
    }

    const updatedAt = new Date().toISOString();
    db.exec("BEGIN");
    try {
      for (const row of normalizedRows) {
        const timestampUtc = Math.floor(Number(row.timestamp) / 1000);
        const close = Number.isFinite(Number(row.close)) ? Number(row.close) : null;
        if (!Number.isFinite(timestampUtc) || close === null) {
          continue;
        }
        insert.run(
          key,
          timestampUtc,
          formatLocalDateTime(new Date(timestampUtc * 1000)),
          timeframe,
          close,
          label,
          updatedAt
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

async function fetchHistoricalRatesWithRetry(options, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await getHistoricalRates(options);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        throw error;
      }
      const delayMs = 1500 * attempt;
      await sleep(delayMs);
    }
  }
  throw lastError;
}

function normalizeRates(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (Array.isArray(row)) {
      return {
        timestamp: row[0],
        open: row[1],
        high: row[2],
        low: row[3],
        close: row[4],
        volume: row[5],
      };
    }
    return row;
  }).filter((row) => row && Number.isFinite(Number(row.timestamp)));
}

function buildRanges(from, to, chunkDays) {
  const ranges = [];
  let cursor = new Date(from.getTime());
  while (cursor <= to) {
    const chunkEnd = new Date(Math.min(
      to.getTime(),
      cursor.getTime() + chunkDays * DAY_MS - 1
    ));
    ranges.push({
      from: new Date(cursor.getTime()),
      to: chunkEnd,
    });
    cursor = new Date(chunkEnd.getTime() + 1);
  }
  return ranges;
}

function loadSeriesRows(db, key) {
  return db.prepare(`
    SELECT
      timestamp_utc AS timestampUtc,
      timestamp_local AS timestampLocal,
      granularity,
      close,
      source_label AS sourceLabel
    FROM source_bars
    WHERE series_key = ?
    ORDER BY timestamp_utc ASC
  `).all(key);
}

function buildSummary(db) {
  const series = {};
  for (const config of SERIES_CONFIG) {
    const summary = db.prepare(`
      SELECT
        COUNT(*) AS rowCount,
        MIN(timestamp_local) AS startTime,
        MAX(timestamp_local) AS endTime
      FROM source_bars
      WHERE series_key = ?
    `).get(config.key);
    series[config.key] = {
      instrument: config.instrument,
      label: config.label,
      rowCount: Number(summary?.rowCount || 0),
      startTime: summary?.startTime || null,
      endTime: summary?.endTime || null,
    };
  }

  return {
    updatedAt: new Date().toISOString(),
    coverage: {
      rmbHighresStartTime: formatLocalDateTime(RMB_HIGHRES_START_UTC),
      fiveMinuteStartTime: formatLocalDateTime(FIVE_MIN_START_UTC),
    },
    series,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatLocalDateTime(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

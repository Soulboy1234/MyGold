import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig, run } from "./monitor.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const STATE_DIR = path.join(ROOT_DIR, "state");
const OUT_DIR = path.join(ROOT_DIR, "out");
const DAEMON_FILE = path.join(STATE_DIR, "daemon.json");
const LOG_FILE = path.join(OUT_DIR, "daemon.log");
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_RUNS = Number(process.env.GOLD_MONITOR_TEST_MAX_RUNS || 0);
const FAILURE_RETRY_BASE_MS = Number(process.env.GOLD_MONITOR_FAILURE_RETRY_MS || 30000);
const FILE_RETRY_DELAYS_MS = [150, 350, 700, 1200];
const UTF8_BOM = "\uFEFF";
let runCount = 0;
let consecutiveFailures = 0;
let lastIntervalMs = DEFAULT_INTERVAL_MS;
let exiting = false;
let lastSuccessAt = null;
let lastFailureAt = null;
let lastError = "";

process.on("uncaughtException", async (error) => {
  await safeLog(`致命异常：${error.message}`);
  await markStopped("error");
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  await safeLog(`未处理拒绝：${message}`);
  await markStopped("error");
  process.exit(1);
});

process.on("SIGINT", async () => {
  await markStopped("stopped");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await markStopped("stopped");
  process.exit(0);
});

process.on("exit", () => {
  if (exiting) {
    return;
  }
  exiting = true;
  try {
    writeFileSync(
      DAEMON_FILE,
      JSON.stringify(
        {
          pid: process.pid,
          stoppedAt: new Date().toISOString(),
          intervalMs: lastIntervalMs,
          runCount,
          consecutiveFailures,
          lastSuccessAt,
          lastFailureAt,
          lastError,
          status: "stopped",
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
  } catch {
  }
});

await mkdir(STATE_DIR, { recursive: true });
await mkdir(OUT_DIR, { recursive: true });
await ensureSingleInstance();
await loop();

async function loop() {
  while (true) {
    const intervalMs = await getConfiguredIntervalMs();
    lastIntervalMs = intervalMs;
    const startedAt = new Date();
    await safeWriteDaemonState({
      pid: process.pid,
      startedAt: startedAt.toISOString(),
      lastLoopStartedAt: startedAt.toISOString(),
      intervalMs,
      runCount,
      consecutiveFailures,
      lastSuccessAt,
      lastFailureAt,
      lastError,
      status: "running",
      nextRunAt: new Date(startedAt.getTime() + getDelayMs(startedAt, intervalMs, false)).toISOString(),
    });

    let failed = false;

    try {
      const status = await run();
      consecutiveFailures = 0;
      lastSuccessAt = new Date().toISOString();
      lastError = "";
      await safeLog(status.message);
    } catch (error) {
      failed = true;
      consecutiveFailures += 1;
      lastFailureAt = new Date().toISOString();
      lastError = error.message;
      await safeLog(`执行失败(${consecutiveFailures})：${error.message}`);
    }

    runCount += 1;
    if (MAX_RUNS > 0 && runCount >= MAX_RUNS) {
      await markStopped("stopped");
      break;
    }

    const delayMs = getDelayMs(new Date(), intervalMs, failed);
    await safeWriteDaemonState({
      pid: process.pid,
      heartbeatAt: new Date().toISOString(),
      intervalMs,
      runCount,
      consecutiveFailures,
      lastSuccessAt,
      lastFailureAt,
      lastError,
      status: failed ? "retrying" : "running",
      nextRunAt: new Date(Date.now() + delayMs).toISOString(),
    });
    await sleep(delayMs);
  }
}

function getDelayMs(now, intervalMs, failed) {
  if (failed) {
    const multiplier = Math.min(4, Math.max(1, consecutiveFailures));
    return FAILURE_RETRY_BASE_MS * multiplier;
  }

  const intervalMinutes = Math.max(1, Math.floor(intervalMs / 60000));
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(Math.floor(next.getMinutes() / intervalMinutes) * intervalMinutes + intervalMinutes);
  return next.getTime() - now.getTime();
}

async function getConfiguredIntervalMs() {
  const envIntervalMs = Number(process.env.GOLD_MONITOR_INTERVAL_MS || 0);
  if (Number.isFinite(envIntervalMs) && envIntervalMs > 0) {
    return envIntervalMs;
  }

  try {
    const config = await loadConfig();
    return Math.max(1, config.schedule.intervalMinutes) * 60 * 1000;
  } catch {
    return DEFAULT_INTERVAL_MS;
  }
}

async function ensureSingleInstance() {
  try {
    const existing = JSON.parse(await readFile(DAEMON_FILE, "utf8"));
    if (existing?.pid && isProcessAlive(existing.pid)) {
      throw new Error(`监控进程已在运行，PID=${existing.pid}`);
    }
    if (existing?.pid) {
      await safeLog(`检测到失效守护状态，清理旧 PID=${existing.pid}，按当前进程 ${process.pid} 恢复运行。`);
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    if (String(error?.message || "").includes("监控进程已在运行")) {
      throw error;
    }
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function markStopped(status) {
  if (exiting) {
    return;
  }
  exiting = true;
  await safeWriteDaemonState({
    pid: process.pid,
    stoppedAt: new Date().toISOString(),
    intervalMs: lastIntervalMs,
    runCount,
    consecutiveFailures,
    lastSuccessAt,
    lastFailureAt,
    lastError,
    status,
  });
}

async function safeWriteDaemonState(state) {
  try {
    await retryFileOp(() => writeFile(DAEMON_FILE, JSON.stringify(state, null, 2) + "\n", "utf8"));
  } catch (error) {
    await safeLog(`写守护状态失败：${error.message}`);
  }
}

async function safeLog(message) {
  const line = `${new Date().toISOString()} ${message}`;
  try {
    await retryFileOp(() => appendLogLine(LOG_FILE, line));
  } catch {
    try {
      await appendFile(LOG_FILE, `${line}\n`, "utf8");
    } catch {
    }
  }
}

async function appendLogLine(filePath, line) {
  try {
    await appendFile(filePath, `${line}\n`, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      await writeFile(filePath, `${UTF8_BOM}${line}\n`, "utf8");
      return;
    }
    throw error;
  }
}

async function retryFileOp(operation) {
  let lastError = null;

  for (let attempt = 0; attempt <= FILE_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetriableFileError(error) || attempt === FILE_RETRY_DELAYS_MS.length) {
        break;
      }
      await sleep(FILE_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError;
}

function isRetriableFileError(error) {
  return ["EBUSY", "EPERM", "EMFILE", "ENFILE"].includes(error?.code);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

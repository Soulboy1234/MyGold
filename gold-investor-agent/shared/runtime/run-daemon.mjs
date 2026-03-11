import { listAgentMetas, runAgentOnce } from "./agent-control.mjs";
import { resolveAgentName } from "./resolve-agent.mjs";

export async function runAgentDaemon() {
  const explicitAgent = process.env.GOLD_INVESTOR_AGENT || null;
  const intervalMinutes = sanitizeIntervalMinutes(process.env.GOLD_INVESTOR_INTERVAL_MINUTES);
  const intervalMs = intervalMinutes * 60 * 1000;

  let stopped = false;

  process.on("SIGINT", () => {
    stopped = true;
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    stopped = true;
    process.exit(0);
  });

  await runCycle(explicitAgent);

  while (!stopped) {
    await sleep(intervalMs);
    if (stopped) break;
    await runCycle(explicitAgent);
  }
}

async function runCycle(explicitAgent) {
  if (explicitAgent) {
    await safeRun(explicitAgent);
    return;
  }

  const agents = await listAgentMetas();
  const enabledAgents = agents.filter((agent) => agent.autoRunEnabled);
  for (const agent of enabledAgents) {
    await safeRun(agent.folderName);
  }
}

async function safeRun(agentName) {
  try {
    await runAgentOnce(agentName || resolveAgentName());
  } catch (error) {
    console.error(`[gold-investor-daemon:${agentName}] ${new Date().toISOString()} ${error?.stack || error?.message || error}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeIntervalMinutes(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.max(1, Math.round(parsed));
}

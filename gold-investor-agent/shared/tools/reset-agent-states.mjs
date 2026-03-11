import {
  listAgentDirs,
  loadAgentConfig,
  resetAgentOutputs,
} from "./agent-state-utils.mjs";

const initialCapital = Number(process.argv[2]) || 100000;
const sellFeePerGram = Number(process.argv[3]) || 4;

const reports = [];

for (const agentDir of await listAgentDirs()) {
  const config = await loadAgentConfig(agentDir);
  await resetAgentOutputs(agentDir, { initialCapital, sellFeePerGram });
  reports.push({
    folderName: config.raw.folderName || config.agentDir,
    displayName: config.raw.displayName || config.agentDir,
    initialCapital,
    sellFeePerGram,
  });
}

console.log(JSON.stringify({
  ok: true,
  resetAt: new Date().toISOString(),
  initialCapital,
  sellFeePerGram,
  agentCount: reports.length,
  reports,
}, null, 2));

import { listAgentMetas, runAgentOnce } from "../runtime/agent-control.mjs";

const agents = await listAgentMetas();
const reports = [];

for (const agent of agents) {
  await runAgentOnce(agent.folderName);
  reports.push({
    folderName: agent.folderName,
    displayName: agent.displayName,
  });
}

console.log(JSON.stringify({
  ok: true,
  ranAt: new Date().toISOString(),
  agentCount: reports.length,
  reports,
}, null, 2));

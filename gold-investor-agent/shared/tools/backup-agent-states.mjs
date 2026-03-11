import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  buildBackupLabel,
  collectAgentSnapshot,
  copyDirectory,
  listAgentDirs,
  loadAgentConfig,
} from "./agent-state-utils.mjs";
import { resolveAgentsDir } from "../runtime/resolve-agent.mjs";

const label = process.argv[2] || "snapshot";
const agentsDir = resolveAgentsDir();
const backupRoot = path.join(agentsDir, "backups");
const folderName = buildBackupLabel(new Date(), label);
const backupDir = path.join(backupRoot, folderName);

await mkdir(backupDir, { recursive: true });

const manifest = {
  createdAt: new Date().toISOString(),
  label,
  backupDir,
  agents: [],
};

for (const agentDir of await listAgentDirs()) {
  const config = await loadAgentConfig(agentDir);
  const snapshot = await collectAgentSnapshot(agentDir);
  const targetDir = path.join(backupDir, snapshot.folderName);
  await mkdir(targetDir, { recursive: true });
  await copyDirectory(config.outputDir, path.join(targetDir, "out"));
  await writeFile(path.join(targetDir, "agent.json"), JSON.stringify(config.raw, null, 2) + "\n", "utf8");
  manifest.agents.push({
    folderName: snapshot.folderName,
    displayName: config.raw.displayName || snapshot.folderName,
    strategyVersion: config.raw.strategyVersion || null,
    initialCapital: snapshot.portfolio?.initialCapital ?? null,
    cashCny: snapshot.portfolio?.cashCny ?? null,
    goldGrams: snapshot.portfolio?.goldGrams ?? null,
    equityCny: snapshot.portfolio?.equityCny ?? null,
    netTotalPnlCny: snapshot.portfolio?.netTotalPnlCny ?? null,
    tradeCount: snapshot.tradeCount,
    backedUpAt: manifest.createdAt,
  });
}

await writeFile(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");
await writeFile(
  path.join(backupDir, "README.md"),
  buildReadme(manifest),
  "utf8"
);

console.log(JSON.stringify({
  ok: true,
  backupDir,
  agentCount: manifest.agents.length,
}, null, 2));

function buildReadme(manifest) {
  const lines = [
    "# Agent Asset Backup",
    "",
    `- Created At: ${manifest.createdAt}`,
    `- Label: ${manifest.label}`,
    "",
    "## Agents",
    "",
  ];

  for (const agent of manifest.agents) {
    lines.push(`- ${agent.displayName} (${agent.folderName})`);
    lines.push(`  - Strategy Version: ${agent.strategyVersion || "-"}`);
    lines.push(`  - Cash: ${agent.cashCny ?? "-"}`);
    lines.push(`  - Gold Grams: ${agent.goldGrams ?? "-"}`);
    lines.push(`  - Equity: ${agent.equityCny ?? "-"}`);
    lines.push(`  - Net PnL: ${agent.netTotalPnlCny ?? "-"}`);
    lines.push(`  - Trade Count: ${agent.tradeCount}`);
  }

  lines.push("");
  lines.push("Each agent folder contains the backed-up agent.json and out/ snapshot.");
  lines.push("");
  return lines.join("\n");
}

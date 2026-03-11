import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const AGENTS_DIR = path.join(PROJECT_ROOT, "agents");

const CANONICAL_AGENT_NAMES = {
  agent1: "agent1-\u57fa\u7840",
  agent2: "agent2-\u77ed\u7ebf\u9009\u624b",
  agent3: "agent3-\u957f\u7ebf\u9009\u624b",
  agent4: "agent4-\u5b9a\u6295\u9009\u624b",
  agent5: "agent5-\u9b3c\u624d\u672c\u4eba",
};

const LEGACY_AGENT_NAME_MAP = new Map([
  ["Agent1-\u57fa\u7840", CANONICAL_AGENT_NAMES.agent1],
  ["Agent2-\u77ed\u7ebf\u9009\u624b", CANONICAL_AGENT_NAMES.agent2],
  ["Agent3-\u957f\u7ebf\u9009\u624b", CANONICAL_AGENT_NAMES.agent3],
  ["Agent4-\u5b9a\u6295\u9009\u624b", CANONICAL_AGENT_NAMES.agent4],
  ["Agent5-\u9b3c\u624d\u672c\u4eba", CANONICAL_AGENT_NAMES.agent5],
  ["Agent1-鍩虹", CANONICAL_AGENT_NAMES.agent1],
  ["Agent2-鐭嚎閫夋墜", CANONICAL_AGENT_NAMES.agent2],
  ["Agent3-闀跨嚎閫夋墜", CANONICAL_AGENT_NAMES.agent3],
  ["Agent4-瀹氭姇閫夋墜", CANONICAL_AGENT_NAMES.agent4],
  ["Agent5-楝兼墠鏈汉", CANONICAL_AGENT_NAMES.agent5],
]);

export const DEFAULT_AGENT_NAME = CANONICAL_AGENT_NAMES.agent1;

export function resolveAgentName() {
  return normalizeAgentName(process.env.GOLD_INVESTOR_AGENT || DEFAULT_AGENT_NAME);
}

export function resolveAgentDir(agentName = resolveAgentName()) {
  if (path.isAbsolute(agentName)) return agentName;
  return path.join(AGENTS_DIR, normalizeAgentName(agentName));
}

export function resolveAgentEntry(agentName = resolveAgentName()) {
  return path.join(resolveAgentDir(agentName), "agent.mjs");
}

export function resolveAgentMetadataPath(agentName = resolveAgentName()) {
  return path.join(resolveAgentDir(agentName), "agent.json");
}

export function resolveManagedOutputDir(agentDir, outputDir = "out") {
  const safeOutputDir = typeof outputDir === "string" && outputDir.trim()
    ? outputDir.trim()
    : "out";
  const resolvedAgentDir = path.resolve(agentDir);
  const resolvedOutputDir = path.resolve(resolvedAgentDir, safeOutputDir);
  const relativePath = path.relative(resolvedAgentDir, resolvedOutputDir);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return path.join(resolvedAgentDir, "out");
  }

  return resolvedOutputDir;
}

export function resolveManagedOutputPath(agentDir, outputDir = "out", fileName = "") {
  return path.join(resolveManagedOutputDir(agentDir, outputDir), fileName);
}

export function resolveProjectRoot() {
  return PROJECT_ROOT;
}

export function resolveAgentsDir() {
  return AGENTS_DIR;
}

export function pathToFileUrl(filePath) {
  return pathToFileURL(filePath).href;
}

export function normalizeAgentName(agentName) {
  return LEGACY_AGENT_NAME_MAP.get(agentName) || agentName;
}

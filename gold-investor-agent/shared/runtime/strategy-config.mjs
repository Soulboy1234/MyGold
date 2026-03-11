import { readFile, writeFile } from "node:fs/promises";

export async function loadStrategyConfig(filePath, defaults, metadata = {}) {
  const stored = await readJson(filePath, null);
  const effective = buildEffectiveConfig(defaults, stored || {});
  const persisted = buildPersistedConfig(effective, stored || {}, metadata);

  if (!stored || JSON.stringify(stored) !== JSON.stringify(persisted)) {
    await writeFile(filePath, JSON.stringify(persisted, null, 2) + "\n", "utf8");
  }

  return effective;
}

async function readJson(filePath, fallbackValue) {
  try {
    return JSON.parse(cleanText(await readFile(filePath, "utf8")));
  } catch {
    return fallbackValue;
  }
}

function buildEffectiveConfig(defaults, stored) {
  const next = {};
  for (const [key, defaultValue] of Object.entries(defaults)) {
    next[key] = coerceValue(stored[key], defaultValue);
  }
  return next;
}

function buildPersistedConfig(effective, stored, metadata) {
  const preservedMeta = Object.fromEntries(
    Object.entries(stored).filter(([key]) => key.startsWith("_"))
  );

  return {
    ...preservedMeta,
    ...(metadata.agentName ? { _agentName: metadata.agentName } : {}),
    ...(metadata.strategyVersion ? { _strategyVersion: metadata.strategyVersion } : {}),
    ...(metadata.description ? { _description: metadata.description } : {}),
    ...effective,
  };
}

function coerceValue(value, defaultValue) {
  if (typeof defaultValue === "number") {
    return Number.isFinite(value) ? Number(value) : defaultValue;
  }
  if (typeof defaultValue === "boolean") {
    return typeof value === "boolean" ? value : defaultValue;
  }
  if (typeof defaultValue === "string") {
    return typeof value === "string" && value.trim() ? value : defaultValue;
  }
  return value ?? defaultValue;
}

function cleanText(value) {
  return String(value).replace(/^\uFEFF/, "");
}

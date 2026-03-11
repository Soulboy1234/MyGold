import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  cancelPendingOrder,
  listAgentMetas,
  loadAgentMeta,
  loadComparablePortfolioSnapshot,
  loadSharedMarketSnapshot,
  runAgentOnce,
  setAgentAutoRun,
  submitManualTrade,
  submitPendingOrder,
} from "./agent-control.mjs";
import {
  resolveAgentName,
  resolveAgentDir,
  resolveManagedOutputPath,
  resolveProjectRoot,
} from "./resolve-agent.mjs";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3080);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

export function startDashboardServer() {
  const projectRoot = resolveProjectRoot();
  const publicDir = path.join(projectRoot, "public");
  const defaultAgent = resolveAgentName();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

      if (req.method === "GET" && url.pathname === "/api/agents") {
        return respondJson(res, {
          defaultAgent,
          appVersion: await loadAppVersion(projectRoot),
          agents: await listAgentMetas(),
        });
      }

      if (req.method === "GET" && url.pathname === "/api/dashboard") {
        const requestedAgent = url.searchParams.get("agent") || defaultAgent;
        const payload = await loadDashboardPayload(requestedAgent);
        if (!payload) return respondJson(res, { error: "Dashboard data not found" }, 404);
        return respondJson(res, payload);
      }

      if (req.method === "POST" && url.pathname === "/api/agents/start") {
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const meta = await setAgentAutoRun(agentName, true);
        await runAgentOnce(agentName);
        return respondJson(res, { ok: true, agent: await loadAgentMeta(meta.folderName) });
      }

      if (req.method === "POST" && url.pathname === "/api/agents/stop") {
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const meta = await setAgentAutoRun(agentName, false);
        return respondJson(res, { ok: true, agent: meta });
      }

      if (req.method === "POST" && url.pathname === "/api/agents/manual-trade") {
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const requestBody = await readJsonBody(req);
        await submitManualTrade(agentName, requestBody);
        const payload = await loadDashboardPayload(agentName);
        return respondJson(res, { ok: true, payload });
      }

      if (req.method === "POST" && url.pathname === "/api/agents/pending-order") {
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const requestBody = await readJsonBody(req);
        const order = await submitPendingOrder(agentName, requestBody);
        const payload = await loadDashboardPayload(agentName);
        return respondJson(res, { ok: true, order, payload });
      }

      if (req.method === "DELETE" && url.pathname === "/api/agents/pending-order") {
        const agentName = url.searchParams.get("agent");
        const orderId = url.searchParams.get("id");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        if (!orderId) return respondJson(res, { error: "Missing pending order id" }, 400);
        const result = await cancelPendingOrder(agentName, orderId);
        const payload = await loadDashboardPayload(agentName);
        return respondJson(res, { ok: true, ...result, payload });
      }

      const filePath = resolvePublicPath(publicDir, url.pathname);
      return respondFile(res, filePath);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(`Server error: ${error.message}`);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`Gold investor dashboard (${defaultAgent}) running at http://${HOST}:${PORT}`);
  });

  return server;
}

async function loadDashboardPayload(agentName) {
  const market = await loadSharedMarketSnapshot();
  const agentMeta = await loadAgentMeta(agentName, { market });
  if (!agentMeta) return null;

  const dashboardFile = resolveManagedOutputPath(
    resolveAgentDir(agentMeta.folderName),
    agentMeta.outputDir || "out",
    "dashboard-data.json"
  );
  const pendingOrdersFile = resolveManagedOutputPath(
    resolveAgentDir(agentMeta.folderName),
    agentMeta.outputDir || "out",
    "pending-orders.json"
  );
  try {
    const payload = JSON.parse(cleanText(await readFile(dashboardFile, "utf8")));
    const pendingOrders = await readJsonFile(pendingOrdersFile, []);
    const comparableSummary = await loadComparablePortfolioSnapshot(agentMeta.folderName, { market });
    const latestAction = payload.summary?.latestAction || payload.latestAction || payload.agent?.lastAction || null;
    return {
      ...payload,
      manualControls: {
        ...(payload.manualControls || {}),
        pendingOrders: Array.isArray(pendingOrders) ? pendingOrders : [],
      },
      latest: market ? {
        ...(payload.latest || {}),
        ...market,
        priceCnyPerGram: comparableSummary.currentPriceCnyPerGram,
      } : payload.latest,
      summary: {
        ...(payload.summary || {}),
        ...comparableSummary,
        latestAction,
        valuationCheckedAtLocal: market?.checkedAtLocal || null,
      },
      agent: agentMeta,
    };
  } catch {
    return { agent: agentMeta, missing: true };
  }
}

function resolvePublicPath(publicDir, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalizedPath = path.normalize(relativePath);
  const resolvedPath = path.resolve(publicDir, normalizedPath);
  if (!resolvedPath.startsWith(path.resolve(publicDir))) return null;
  return resolvedPath;
}

async function respondFile(res, filePath) {
  if (!filePath) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON request body");
  }
}

function respondJson(res, payload, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function cleanText(value) {
  return String(value).replace(/^\uFEFF/, "");
}

async function loadAppVersion(projectRoot) {
  try {
    const packageJson = JSON.parse(cleanText(await readFile(path.join(projectRoot, "package.json"), "utf8")));
    return packageJson.version || null;
  } catch {
    return null;
  }
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(cleanText(await readFile(filePath, "utf8")));
  } catch {
    return fallbackValue;
  }
}

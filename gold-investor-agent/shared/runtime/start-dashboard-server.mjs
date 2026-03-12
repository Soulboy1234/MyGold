import { createServer } from "node:http";
import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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

const PORT = Number(process.env.PORT || 3080);
const SERVER_BINDING = resolveServerBinding();
const HOST = SERVER_BINDING.host;
const WRITE_TOKEN = crypto.randomUUID();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function startDashboardServer() {
  const projectRoot = resolveProjectRoot();
  const publicDir = path.join(projectRoot, "public");
  const defaultAgent = resolveAgentName();

  const server = createServer(async (req, res) => {
    try {
      if (!isRequestAllowed(req, SERVER_BINDING.mode)) {
        res.writeHead(403, buildHeaders({
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        }));
        res.end("Forbidden");
        return;
      }

      const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);

      if (req.method === "GET" && url.pathname === "/api/agents") {
        return respondJson(res, {
          defaultAgent,
          appVersion: await loadAppVersion(projectRoot),
          security: buildSecurityDescriptor(),
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
        ensureMutationAuthorized(req);
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const meta = await setAgentAutoRun(agentName, true);
        await runAgentOnce(agentName);
        return respondJson(res, { ok: true, agent: await loadAgentMeta(meta.folderName) });
      }

      if (req.method === "POST" && url.pathname === "/api/agents/stop") {
        ensureMutationAuthorized(req);
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const meta = await setAgentAutoRun(agentName, false);
        return respondJson(res, { ok: true, agent: meta });
      }

      if (req.method === "POST" && url.pathname === "/api/agents/manual-trade") {
        ensureMutationAuthorized(req);
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const requestBody = await readJsonBody(req);
        await submitManualTrade(agentName, requestBody);
        const payload = await loadDashboardPayload(agentName);
        return respondJson(res, { ok: true, payload });
      }

      if (req.method === "POST" && url.pathname === "/api/agents/pending-order") {
        ensureMutationAuthorized(req);
        const agentName = url.searchParams.get("agent");
        if (!agentName) return respondJson(res, { error: "Missing agent name" }, 400);
        const requestBody = await readJsonBody(req);
        const order = await submitPendingOrder(agentName, requestBody);
        const payload = await loadDashboardPayload(agentName);
        return respondJson(res, { ok: true, order, payload });
      }

      if (req.method === "DELETE" && url.pathname === "/api/agents/pending-order") {
        ensureMutationAuthorized(req);
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
      res.writeHead(error.statusCode || 500, buildHeaders({
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      }));
      res.end(`Server error: ${error.message}`);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`Gold investor dashboard (${defaultAgent}) running at http://${HOST}:${PORT} [mode=${SERVER_BINDING.mode}]`);
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
    res.writeHead(404, buildHeaders({ "content-type": "text/plain; charset=utf-8" }));
    res.end("Not found");
    return;
  }
  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    const shouldDisableCache = [".html", ".js", ".css"].includes(ext);
    res.writeHead(200, buildHeaders({
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": shouldDisableCache ? "no-store" : "public, max-age=300",
    }));
    res.end(body);
  } catch {
    res.writeHead(404, buildHeaders({ "content-type": "text/plain; charset=utf-8" }));
    res.end("Not found");
  }
}

async function readJsonBody(req) {
  ensureJsonContentType(req);
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > 64 * 1024) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
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

function ensureJsonContentType(req) {
  const contentType = String(req.headers["content-type"] || "").trim().toLowerCase();
  if (!contentType) {
    const error = new Error("Missing content type; expected application/json");
    error.statusCode = 415;
    throw error;
  }
  if (contentType.startsWith("application/json")) return;
  const error = new Error("Unsupported content type; expected application/json");
  error.statusCode = 415;
  throw error;
}

function respondJson(res, payload, status = 200) {
  res.writeHead(status, buildHeaders({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  }));
  res.end(JSON.stringify(payload));
}

function buildHeaders(overrides = {}) {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "content-security-policy": CONTENT_SECURITY_POLICY,
    ...overrides,
  };
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

function buildSecurityDescriptor() {
  return {
    bindMode: SERVER_BINDING.mode,
    writeToken: WRITE_TOKEN,
    requiresSameOrigin: requiresSameOriginGuard(SERVER_BINDING.mode),
  };
}

function resolveServerBinding() {
  const explicitHost = String(process.env.HOST || "").trim();
  if (explicitHost) {
    return {
      host: explicitHost,
      mode: "custom",
    };
  }

  if (isSynologyEnvironment()) {
    return {
      host: "0.0.0.0",
      mode: "nas",
    };
  }

  return {
    host: "127.0.0.1",
    mode: "local",
  };
}

function isSynologyEnvironment() {
  if (String(process.env.SYNOLOGY_DSM || "").trim() === "1") return true;
  if (String(process.env.SYNO_DSM || "").trim() === "1") return true;
  if (process.platform !== "linux") return false;
  if (existsSync("/etc/synoinfo.conf")) return true;
  if (existsSync("/etc.defaults/VERSION")) {
    try {
      const versionText = readFileSync("/etc.defaults/VERSION", "utf8");
      return /productversion|buildnumber/i.test(versionText);
    } catch {
      return false;
    }
  }
  return false;
}

function isRequestAllowed(req, mode) {
  const remoteAddress = normalizeRemoteAddress(req.socket?.remoteAddress || "");
  if (!remoteAddress) return false;

  if (mode === "local") {
    return isLoopbackAddress(remoteAddress);
  }

  if (mode === "nas") {
    return isPrivateOrLoopbackAddress(remoteAddress);
  }

  return true;
}

function ensureMutationAuthorized(req) {
  const requestToken = String(req.headers["x-gold-investor-write-token"] || "").trim();
  if (!requestToken || requestToken !== WRITE_TOKEN) {
    const error = new Error("Missing or invalid write token");
    error.statusCode = 403;
    throw error;
  }

  if (requiresSameOriginGuard(SERVER_BINDING.mode) && !isSameOriginMutationRequest(req)) {
    const error = new Error("Mutation requests must originate from the dashboard page");
    error.statusCode = 403;
    throw error;
  }
}

function requiresSameOriginGuard(mode) {
  return mode !== "local";
}

function isSameOriginMutationRequest(req) {
  const host = String(req.headers.host || "").trim().toLowerCase();
  if (!host) return false;

  const origin = String(req.headers.origin || "").trim();
  const referer = String(req.headers.referer || "").trim();
  const secFetchSite = String(req.headers["sec-fetch-site"] || "").trim().toLowerCase();

  const headerMatches = origin
    ? matchesHostHeader(origin, host)
    : referer
      ? matchesHostHeader(referer, host)
      : false;

  if (!headerMatches) return false;
  if (!secFetchSite) return true;
  return secFetchSite === "same-origin" || secFetchSite === "same-site";
}

function matchesHostHeader(candidateUrl, expectedHost) {
  try {
    const parsed = new URL(candidateUrl);
    return parsed.host.toLowerCase() === expectedHost;
  } catch {
    return false;
  }
}

function normalizeRemoteAddress(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice(7);
  }
  return trimmed;
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1";
}

function isPrivateOrLoopbackAddress(address) {
  if (isLoopbackAddress(address)) return true;
  if (/^10\./.test(address)) return true;
  if (/^192\.168\./.test(address)) return true;
  const match172 = address.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (/^169\.254\./.test(address)) return true;
  if (/^(fc|fd)/i.test(address)) return true;
  if (/^fe80:/i.test(address)) return true;
  return false;
}

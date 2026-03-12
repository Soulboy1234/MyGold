# V3.1.0 版本更新说明

更新日期：2026-03-10

本次版本聚焦在运行时稳定性和多 Agent 面板容错，不调整交易规则本身。

1. 运行时稳定性
- `shared/runtime/run-daemon.mjs`
- 对 `GOLD_INVESTOR_INTERVAL_MINUTES` 增加了安全兜底。
- 非数字、空值、0 或负数不再导致异常轮询节奏，而是统一回退到 `10` 分钟。

2. 数据加载兼容性
- `shared/runtime/agent-control.mjs`
- `shared/runtime/start-dashboard-server.mjs`
- 统一补上 UTF-8 BOM 清理，避免本地 JSON 文件带 BOM 时被 `JSON.parse(...)` 直接打断。
- 这次重点覆盖了共享市场快照和 dashboard 输出读取链路。

3. Dashboard 服务收口
- `shared/runtime/start-dashboard-server.mjs`
- 静态文件路径现在会强制限制在 `public/` 目录内。
- 像 `../package.json` 这类越界访问会直接返回 `404`。

4. 前端容错
- `public/app.js`
- 页面初始化失败时会显示明确错误面板，不再静默空白。
- 单个 Agent 的 dashboard 拉取失败时，会把该 Agent 标记为读取失败，但不会拖垮整个多 Agent 页面刷新。
- 前端请求现在会检查 HTTP 状态码，避免把服务端错误当成正常 JSON 继续吞掉。

5. 验证
- 已执行 `node --check`
  - `shared/runtime/run-daemon.mjs`
  - `shared/runtime/start-dashboard-server.mjs`
  - `public/app.js`
- 已执行单次 Agent 运行
  - `src/agent.mjs`
- 已验证 dashboard 接口
  - `/api/agents`
  - `../package.json` 越界访问返回 `404`

6. 当前快照
- `Agent1-基础`：`+60.90`
- `Agent2-短线选手`：`+70.82`
- `Agent3-长线选手`：`+61.96`

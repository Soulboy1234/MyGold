# V4.3.4

更新时间：2026-03-12 16:35:00 +08:00

## 本版变更

- 将 `runAgentOnce(...)` 的执行方式从 `execFile` 缓冲模式收敛为更稳的流式子进程执行：
  - 避免因日志输出过多触发 `maxBuffer` 失败
  - 保留超时控制，并增加超时后的强制回收兜底
- 收敛投资面板首页布局中的重复 `.hero` 规则，移除 `flex/grid` 混用带来的响应式冲突。
- 头部“当前数据时间 / 最新 Agent 监测”改为按真实时间解析后取最新值，避免不同时间字符串格式下的排序误判。
- 写接口的 JSON 请求头校验进一步收紧：
  - 变更型 POST 请求现在缺少 `Content-Type: application/json` 时会返回 `415`
- 同步更新环境打包版本：
  - `gold-task-suite-win` -> `V1.3.4`
  - `gold-task-suite-linux` -> `V1.3.4`
  - `gold-task-suite-macos` -> `V1.3.4`
  - `gold-task-suite-dsm` -> `V1.3.4`

## 验证

- `node --check`
  - `gold-investor-agent/shared/runtime/agent-control.mjs`
  - `gold-investor-agent/shared/runtime/start-dashboard-server.mjs`
  - `gold-investor-agent/public/app.js`
  - `gold-investor-agent/public/dashboard-render.js`
  - `gold-investor-agent/public/dashboard-config.js`
- `node shared/tools/validate-agents.mjs`：通过
- 临时端口面板接口冒烟：
  - `GET http://127.0.0.1:3180/api/agents` -> `200`
  - `POST http://127.0.0.1:3182/api/agents/manual-trade?...` 在缺少 `application/json` 时 -> `415`

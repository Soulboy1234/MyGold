# V3.1.1 版本更新说明

更新日期：2026-03-10

本次版本把 live 项目的 Agent 目录命名统一成小写，同时保留旧名称兼容，重点是目录规范化和路径稳定性。

1. 目录规范化
- live 目录从 `Agents/AgentX-*` 统一改为：
  - `agents/agent1-基础`
  - `agents/agent2-短线选手`
  - `agents/agent3-长线选手`
- 公共解析入口同步切到 [resolve-agent.mjs](/D:/codex/gold-investor-agent/shared/runtime/resolve-agent.mjs) 的新目录规则。

2. 兼容旧名称
- 共享运行时增加了旧名称到新目录名的归一化映射。
- 旧的 `Agent1-基础 / Agent2-短线选手 / Agent3-长线选手` 仍可作为环境变量或手动参数使用。
- 前端也会把浏览器里旧的已选 Agent 名称自动迁移到新的小写目录名。

3. 元数据与文档修正
- [agent1-基础/agent.json](/D:/codex/gold-investor-agent/agents/agent1-%E5%9F%BA%E7%A1%80/agent.json)
- [agent2-短线选手/agent.json](/D:/codex/gold-investor-agent/agents/agent2-%E7%9F%AD%E7%BA%BF%E9%80%89%E6%89%8B/agent.json)
- [agent3-长线选手/agent.json](/D:/codex/gold-investor-agent/agents/agent3-%E9%95%BF%E7%BA%BF%E9%80%89%E6%89%8B/agent.json)
- [README.md](/D:/codex/gold-investor-agent/README.md)
- 各 Agent 的 `strategy-report.md` 里旧的 `Agents/AgentX` 输出路径也已同步为新路径。

4. 稳定性补强
- `loadAgentMeta(...)` / `setAgentAutoRun(...)` / `runAgentOnce(...)` 现在都会先做 Agent 名称归一化，避免旧名称命中时返回错误的 `folderName` 或 `autoRunEnabled` 状态。
- 目录改名后，dashboard 与 daemon 已按新路径重启验证。

5. 验证
- 已执行 `node --check`
  - [resolve-agent.mjs](/D:/codex/gold-investor-agent/shared/runtime/resolve-agent.mjs)
  - [agent-control.mjs](/D:/codex/gold-investor-agent/shared/runtime/agent-control.mjs)
  - [app.js](/D:/codex/gold-investor-agent/public/app.js)
- 已验证：
  - 默认入口 [src/agent.mjs](/D:/codex/gold-investor-agent/src/agent.mjs)
  - 旧环境变量名 `Agent2-短线选手` 仍可运行
  - `/api/agents` 返回新的小写 `folderName`

6. 当前快照
- `agent1-基础`：`+46.45`
- `agent2-短线选手`：`+53.98`
- `agent3-长线选手`：`+53.55`

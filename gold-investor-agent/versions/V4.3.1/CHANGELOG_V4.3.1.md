# V4.3.1

更新时间：2026-03-12 11:10:00 +08:00

## 本版变更

- 修复投资面板在自定义 `HOST` 对外监听时的写接口防护边界，所有非本地绑定模式现在都要求：
  - 运行时写令牌
  - 来自面板页面本身的同源浏览器请求
- 保留本地桌面默认行为：
  - 默认仅监听 `127.0.0.1`
  - 本机 loopback 访问仍可正常执行面板写操作
- 统一更新四套环境打包版本：
  - `gold-task-suite-win` -> `V1.3.1`
  - `gold-task-suite-linux` -> `V1.3.1`
  - `gold-task-suite-macos` -> `V1.3.1`
  - `gold-task-suite-dsm` -> `V1.3.1`
- 同步刷新打包清单、布局校验和根 README 中的受管版本声明。

## 验证

- `node --check`
  - `D:\\codex\\gold-monitor\\src\\monitor.mjs`
  - `D:\\codex\\gold-monitor\\src\\daemon.mjs`
  - `D:\\codex\\gold-dashboard\\server.mjs`
  - `D:\\codex\\gold-investor-agent\\shared\\runtime\\start-dashboard-server.mjs`
  - `D:\\codex\\gold-investor-agent\\shared\\runtime\\strategy-config.mjs`
  - `D:\\codex\\gold-investor-agent\\public\\app.js`
  - `D:\\codex\\gold-investor-agent\\public\\dashboard-render.js`
- `D:\\codex\\gold-investor-agent\\shared\\tools\\validate-agents.mjs`：通过
- `D:\\codex\\gold-task-suite-win\\verify-layout.ps1`：通过

# Gold Task Suite

这是黄金追踪、黄金追踪可视、黄金投资Agent 三个项目的统一外层控制项目，用来管理环境要求、版本信息、安装入口和统一启动方式。

## 目录关系

- `..\gold-monitor`：黄金追踪
- `..\gold-dashboard`：黄金追踪可视
- `..\gold-investor-agent`：黄金投资Agent
- `.\manifest.json`：统一版本与环境清单
- `.\install.cmd`：统一安装入口
- `.\install-and-run.cmd`：一键安装并启动
- `.\install-autostart.ps1`：安装开机自启任务
- `.\verify-layout.ps1`：校验整包是否完整
- `.\open-all-panels.cmd`：一键启动并打开所有面板
- `.\start-all.cmd`：统一启动
- `.\start-all-silent.cmd`：静默启动，不打开浏览器
- `.\stop-all.cmd`：统一停止

## 运行环境

- Windows 10/11 x64
- PowerShell 5.1 或更高
- Node.js 22 或更高
- 推荐 Node.js 24 LTS
- 允许联网获取黄金、汇率和宏观数据

## 已纳管版本

- 黄金追踪：`package 1.1.0`，快照版本 `V1.1.0`
- 黄金追踪可视：`package 1.0.0`，快照版本 `V1.0.0`
- 黄金投资Agent：`package 4.2.0`，快照版本 `V4.2.0`

详细信息见 `manifest.json`。

## 安装

把整个工作区目录一起拷到另一台电脑后，进入 `gold-task-suite` 目录，双击 `install-and-run.cmd`，或者先执行安装：

```powershell
cd .\gold-task-suite
.\install.cmd
```

安装脚本会：

- 先校验整包目录、关键入口和最新版本快照是否完整
- 检查三个项目目录是否齐全
- 检查 Node.js 是否已安装
- 在可用时通过 `winget` 自动安装 Node.js LTS
- 校验 Node.js 主版本是否满足要求
- 创建统一运行所需目录
- 安装开机自启任务 `CodexGoldSuiteAutoStart`
- 生成 `install-state.json` 记录当前安装环境

自动启动安装逻辑：

- 优先尝试注册 Windows 计划任务，实现系统启动后自动拉起
- 如果当前权限不允许创建计划任务，则自动回退到当前用户的 Startup 启动目录，在用户登录后自动拉起

如需额外保留旧版“仅黄金追踪单任务”计划任务，可执行：

```powershell
.\install.ps1 -InstallLegacyMonitorTask
```

如果希望安装完成后立即拉起全部服务，可直接执行：

```powershell
.\install-and-run.cmd
```

## 运行

统一启动：

```powershell
.\start-all.cmd
```

统一停止：

```powershell
.\stop-all.cmd
```

启动后默认访问：

- 黄金追踪可视：`http://127.0.0.1:3099`
- 黄金投资Agent 面板：`http://127.0.0.1:3080`

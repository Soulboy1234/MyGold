# Agent3-长线选手

这个 Agent 是从 `Agent1-基础` 当前状态复制出来的长线分身。

本目录存放：
- `agent.mjs`：Agent3 的个体策略与执行入口
- `agent.json`：Agent 元数据
- `out/`：Agent3 独立输出数据

策略方向：
- 更偏长线
- 更少操作
- 更重视卖出手续费约束
- 更强调只在高质量趋势环境下逐步调仓

共享层不放在这里：
- 公共面板资源在 `D:\\codex\\gold-investor-agent\\public`
- 公共运行时在 `D:\\codex\\gold-investor-agent\\shared\\runtime`

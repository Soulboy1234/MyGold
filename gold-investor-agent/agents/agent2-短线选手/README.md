# Agent2-短线选手

这是从 `Agent1-基础` 当前状态复制出来的独立 Agent。

目录内容：
- `agent.mjs`：Agent2 的个体策略入口
- `agent.json`：Agent2 元数据
- `out/`：Agent2 独立输出数据

当前策略版本：`v3.2.0`

定位：
- 比 Agent1 更主动
- 允许更频繁的短线加减仓
- 但会优先过滤掉被手续费吃掉的低质量减仓

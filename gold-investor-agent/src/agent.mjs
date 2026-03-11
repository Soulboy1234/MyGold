import { runAgentOnce } from "../shared/runtime/agent-control.mjs";
import { resolveAgentName } from "../shared/runtime/resolve-agent.mjs";

await runAgentOnce(resolveAgentName());

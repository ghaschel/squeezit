import { runHarnessCommand } from "./agent-harness";

await runHarnessCommand("agent:status", process.argv.slice(2));

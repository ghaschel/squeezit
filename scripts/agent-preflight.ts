import { runHarnessCommand } from "./agent-harness";

await runHarnessCommand("agent:preflight", process.argv.slice(2));

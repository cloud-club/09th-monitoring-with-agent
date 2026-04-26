#!/usr/bin/env node
import { parseArgs, printScenarioList, printUsage } from "../lib/args.mjs";
import { chaosScenarios, k6Scenarios } from "../scenarios/index.mjs";
import { recover, runChaos } from "../runners/chaos-runner.mjs";
import { runK6 } from "../runners/k6-runner.mjs";

export { parseArgs };

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "help" || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "list") {
    printScenarioList({ type: options.type || "all", k6Scenarios, chaosScenarios });
    return;
  }

  if (command === "k6") {
    await runK6(options);
    return;
  }

  if (command === "chaos") {
    await runChaos(options);
    return;
  }

  if (command === "recover") {
    await recover();
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}

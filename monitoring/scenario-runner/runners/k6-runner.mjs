import { spawnSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { k6Scenarios, selectScenarios, selectScenariosByPack } from "../scenarios/index.mjs";
import { config, K6_SCRIPT_PATH, ROOT_DIR } from "../lib/config.mjs";
import { ensureK6Available } from "../lib/processes.mjs";

export async function runK6(options) {
  const rawScenarioSelection = options.scenario || process.env.SCENARIO_IDS;
  const selected = rawScenarioSelection
    ? selectScenarios(k6Scenarios, rawScenarioSelection)
    : selectScenariosByPack(k6Scenarios, options.pack || process.env.SCENARIO_PACK || "smoke");
  ensureK6Available();
  const scenarioIds = selected.map((scenario) => scenario.id).join(",");
  const summaryExport = options.summaryExport || config.summaryExport;
  await mkdir(dirname(resolve(ROOT_DIR, summaryExport)), { recursive: true });

  const k6Args = [
    "run",
    "-e",
    `BASE_URL=${options.baseUrl || config.backendBaseUrl}`,
    "-e",
    `SCENARIO_IDS=${scenarioIds}`,
    "-e",
    `DURATION=${options.duration || config.duration}`,
    "-e",
    `VUS=${options.vus || config.vus}`,
    "-e",
    `RESET_SEED=${options.resetSeed || config.resetSeed}`,
    "-e",
    `SLEEP_SECONDS=${options.sleepSeconds || config.sleepSeconds}`,
    "-e",
    `SUMMARY_EXPORT=${summaryExport}`,
    K6_SCRIPT_PATH,
  ];

  console.log(`Running k6 scenarios: ${scenarioIds}`);
  console.log(`Backend: ${options.baseUrl || config.backendBaseUrl}`);
  const result = spawnSync("k6", k6Args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

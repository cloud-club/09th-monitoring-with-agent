import {
  DEFAULT_BACKEND_BASE_URL,
  DEFAULT_LOKI_BASE_URL,
  DEFAULT_PROMETHEUS_BASE_URL,
  DEFAULT_SUMMARY_EXPORT,
  DEFAULT_TEMPO_BASE_URL,
} from "./config.mjs";

export function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    const next = rest[index + 1];
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
    } else if (next !== undefined && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = "true";
    }
  }

  return { command, options };
}

export function printUsage() {
  console.log(`Usage:
  node monitoring/scenario-runner/cli/run-scenario.mjs list [--type k6|chaos|all]
  node monitoring/scenario-runner/cli/run-scenario.mjs k6 --scenario fault-search-delay[,buyer-payment-failure]
  node monitoring/scenario-runner/cli/run-scenario.mjs k6 --pack smoke
  node monitoring/scenario-runner/cli/run-scenario.mjs chaos --scenario service-down
  node monitoring/scenario-runner/cli/run-scenario.mjs recover

Environment:
  BASE_URL=${DEFAULT_BACKEND_BASE_URL}
  PROMETHEUS_BASE_URL=${DEFAULT_PROMETHEUS_BASE_URL}
  LOKI_BASE_URL=${DEFAULT_LOKI_BASE_URL}
  TEMPO_BASE_URL=${DEFAULT_TEMPO_BASE_URL}
  DURATION=5m
  VUS=4
  SCENARIO_PACK=smoke
  RESET_SEED=true
  SLEEP_SECONDS=1
  SUMMARY_EXPORT=${DEFAULT_SUMMARY_EXPORT}`);
}

export function printScenarioList({ type = "all", k6Scenarios, chaosScenarios }) {
  const groups = [];
  if (type === "all" || type === "k6") {
    groups.push(["k6", k6Scenarios]);
  }
  if (type === "all" || type === "chaos") {
    groups.push(["chaos", chaosScenarios]);
  }

  for (const [label, scenarios] of groups) {
    console.log(`\n${label}`);
    for (const scenario of scenarios) {
      const pack = scenario.pack ? ` [${scenario.pack}]` : "";
      const tags = Array.isArray(scenario.tags) && scenario.tags.length > 0 ? ` tags=${scenario.tags.join(",")}` : "";
      console.log(`  ${scenario.id}${pack} - ${scenario.description}${tags}`);
    }
  }
}

import { chaosScenarios } from "./chaos-scenarios.mjs";
import { k6Packs, k6Scenarios } from "./k6-scenarios.mjs";

export { chaosScenarios, k6Packs, k6Scenarios };

export function selectScenarios(allScenarios, rawSelection) {
  const requested = String(rawSelection || "all")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (requested.length === 0 || requested.includes("all")) {
    return allScenarios;
  }

  const byId = new Map(allScenarios.map((scenario) => [scenario.id, scenario]));
  const missing = requested.filter((scenarioId) => !byId.has(scenarioId));
  if (missing.length > 0) {
    throw new Error(`Unknown scenario id(s): ${missing.join(", ")}`);
  }

  return requested.map((scenarioId) => byId.get(scenarioId));
}

export function selectScenariosByPack(allScenarios, rawPack) {
  const pack = String(rawPack || "smoke").trim();
  if (pack === "all") {
    return allScenarios;
  }

  if (!k6Packs.includes(pack)) {
    throw new Error(`Unknown scenario pack: ${pack}`);
  }

  const selected = allScenarios.filter((scenario) => scenario.pack === pack);
  if (selected.length === 0) {
    throw new Error(`Scenario pack has no scenarios: ${pack}`);
  }
  return selected;
}

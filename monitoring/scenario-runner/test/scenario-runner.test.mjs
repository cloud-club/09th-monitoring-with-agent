import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import { parseArgs } from "../cli/run-scenario.mjs";
import { k6Scenarios, chaosScenarios, selectScenarios, selectScenariosByPack } from "../scenarios/index.mjs";

const execFileAsync = promisify(execFile);
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CLI_PATH = resolve(ROOT_DIR, "monitoring/scenario-runner/cli/run-scenario.mjs");

test("parseArgs supports command and long options", () => {
  const parsed = parseArgs(["k6", "--scenario", "fault-search-delay", "--vus=2"]);

  assert.equal(parsed.command, "k6");
  assert.equal(parsed.options.scenario, "fault-search-delay");
  assert.equal(parsed.options.vus, "2");
});

test("selectScenarios returns all scenarios for all and validates unknown ids", () => {
  assert.equal(selectScenarios(k6Scenarios, "all").length, k6Scenarios.length);
  assert.deepEqual(
    selectScenarios(k6Scenarios, "fault-search-delay").map((scenario) => scenario.id),
    ["fault-search-delay"],
  );
  assert.throws(() => selectScenarios(k6Scenarios, "missing"), /Unknown scenario/);
});

test("selectScenariosByPack resolves k6 packs and validates unknown packs", () => {
  assert.deepEqual(
    selectScenariosByPack(k6Scenarios, "smoke").map((scenario) => scenario.id),
    ["business-success-funnel", "health-success", "metrics-text-check"],
  );
  assert.equal(selectScenariosByPack(k6Scenarios, "all").length, k6Scenarios.length);
  assert.throws(() => selectScenariosByPack(k6Scenarios, "missing"), /Unknown scenario pack/);
});

test("scenario catalogs expose required direct-runner coverage", () => {
  const k6Ids = new Set(k6Scenarios.map((scenario) => scenario.id));
  const chaosIds = new Set(chaosScenarios.map((scenario) => scenario.id));

  [
    "business-success-funnel",
    "health-success",
    "metrics-text-check",
    "catalog-list-success",
    "buyer-success-funnel",
    "route-not-found",
    "buyer-payment-failure",
    "fault-search-delay",
    "validation-4xx-burst",
    "payment-failure-types",
  ].forEach((scenarioId) => assert.ok(k6Ids.has(scenarioId), scenarioId));

  [
    "service-down",
    "cpu-pressure",
    "db-connection-saturation",
    "network-delay",
    "tempo-stop",
    "log-before-kill",
  ].forEach((scenarioId) => assert.ok(chaosIds.has(scenarioId), scenarioId));
});

test("k6 scenario catalog exposes source-of-truth metadata", () => {
  k6Scenarios.forEach((scenario) => {
    assert.equal(typeof scenario.id, "string");
    assert.equal(typeof scenario.name, "string");
    assert.equal(typeof scenario.description, "string");
    assert.equal(typeof scenario.pack, "string");
    assert.ok(Array.isArray(scenario.tags), scenario.id);
    assert.equal(scenario.destructive, false);
  });
});

test("list command prints k6 and chaos scenario ids", async () => {
  const { stdout } = await execFileAsync(process.execPath, [CLI_PATH, "list"], {
    cwd: ROOT_DIR,
    timeout: 10_000,
  });

  assert.match(stdout, /fault-search-delay/);
  assert.match(stdout, /\[smoke\]/);
  assert.match(stdout, /service-down/);
});

test("chaos command requires an explicit scenario id", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [CLI_PATH, "chaos", "--scenario"], {
      cwd: ROOT_DIR,
      timeout: 10_000,
    }),
    /--scenario is required/,
  );
});

test("k6 command validates scenario ids before requiring k6", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [CLI_PATH, "k6", "--scenario", "missing"], {
      cwd: ROOT_DIR,
      timeout: 10_000,
    }),
    /Unknown scenario/,
  );
});

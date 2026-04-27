const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

const SERVER_PORT = 18081;
const BASE_URL = `http://127.0.0.1:${SERVER_PORT}`;
const BACKEND_PORT = 18082;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("server did not start in time"));
    }, 10000);

    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("server_start")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`server exited before start: ${code}`));
    });
  });
}

async function startDemoServer(t, env) {
  const logDir = mkdtempSync(path.join(tmpdir(), "mwa-chaos-test-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      HOST: "127.0.0.1",
      LOG_DIR: logDir,
      SCENARIO_RESET_SEED_ENABLED: "false",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    child.kill("SIGTERM");
  });

  await waitForServer(child);
  return child;
}

function startFakeBackend() {
  const server = http.createServer((req, res) => {
    if (req.url === "/contract/error") {
      res.writeHead(500, {
        "content-type": "application/json",
        "x-trace-id": "11111111111111111111111111111111",
      });
      res.end(JSON.stringify({ success: false, error: { code: "INTERNAL_SERVER_ERROR" } }));
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, data: { status: "ok" } }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: false }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(BACKEND_PORT, "127.0.0.1", () => resolve(server));
  });
}

async function pollRun(runId) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const response = await fetch(`${BASE_URL}/qa/chaos/runs/${runId}`);
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.errors.join(" / "));
    }
    if (!["queued", "running"].includes(payload.run.status)) {
      return payload.run;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("chaos run did not finish in time");
}

async function pollBatch(batchId) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const response = await fetch(`${BASE_URL}/qa/chaos/batches/${batchId}`);
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.errors.join(" / "));
    }
    if (payload.batch.summary.completed === payload.batch.summary.total) {
      return payload.batch;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("chaos batch did not finish in time");
}

test("chaos API is discoverable but disabled by default", { concurrency: false }, async (t) => {
  await startDemoServer(t, {
    QA_CHAOS_ENABLED: "false",
  });

  const scenariosResponse = await fetch(`${BASE_URL}/qa/chaos/scenarios`);
  assert.equal(scenariosResponse.status, 200);
  const scenariosPayload = await scenariosResponse.json();
  assert.equal(scenariosPayload.success, true);
  assert.equal(scenariosPayload.enabled, false);
  assert.ok(scenariosPayload.scenarios.length >= 9);
  assert.ok(scenariosPayload.scenarios.some((scenario) => scenario.id === "api-5xx-error-rate"));

  const k6CatalogResponse = await fetch(`${BASE_URL}/qa/scenarios/k6/catalog`);
  assert.equal(k6CatalogResponse.status, 200);
  const k6CatalogPayload = await k6CatalogResponse.json();
  assert.equal(k6CatalogPayload.success, true);
  assert.ok(k6CatalogPayload.catalog.scenarios.some((scenario) => scenario.id === "health-success"));
  assert.ok(k6CatalogPayload.catalog.scenarios.some((scenario) => scenario.pack === "smoke"));

  const k6RunResponse = await fetch(`${BASE_URL}/qa/scenarios/k6/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pack: "smoke" }),
  });
  assert.equal(k6RunResponse.status, 501);
  const k6RunPayload = await k6RunResponse.json();
  assert.equal(k6RunPayload.success, false);
  assert.match(k6RunPayload.command, /--pack smoke/);

  const runResponse = await fetch(`${BASE_URL}/qa/chaos/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioId: "api-5xx-error-rate" }),
  });
  assert.equal(runResponse.status, 403);
  const runPayload = await runResponse.json();
  assert.equal(runPayload.success, false);
  assert.match(runPayload.errors[0], /disabled/);
});

test("run-batch accepts all chaos scenarios and creates queued runs", { concurrency: false }, async (t) => {
  const fakeBackend = await startFakeBackend();
  t.after(() => {
    fakeBackend.close();
  });

  await startDemoServer(t, {
    QA_CHAOS_ENABLED: "true",
    SCENARIO_BACKEND_BASE_URL: BACKEND_URL,
  });

  const scenariosResponse = await fetch(`${BASE_URL}/qa/chaos/scenarios`);
  const scenariosPayload = await scenariosResponse.json();
  const scenarioIds = scenariosPayload.scenarios.map((scenario) => scenario.id);
  const expectedScenarioCount = scenarioIds.length;
  const batchResponse = await fetch(`${BASE_URL}/qa/chaos/run-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioIds }),
  });
  assert.equal(batchResponse.status, 202);
  const batchPayload = await batchResponse.json();
  assert.equal(batchPayload.success, true);
  assert.equal(batchPayload.batch.runs.length, expectedScenarioCount);
  assert.equal(batchPayload.batch.summary.total, expectedScenarioCount);

  const runsResponse = await fetch(`${BASE_URL}/qa/chaos/runs`);
  const runsPayload = await runsResponse.json();
  assert.equal(runsPayload.success, true);
  assert.equal(runsPayload.summary.total, expectedScenarioCount);

  await fetch(`${BASE_URL}/qa/chaos/recover`, { method: "POST" });
});

test("runner-smoke-5xx is an executable chaos batch run", { concurrency: false }, async (t) => {
  const fakeBackend = await startFakeBackend();
  t.after(() => {
    fakeBackend.close();
  });

  await startDemoServer(t, {
    QA_CHAOS_ENABLED: "true",
    SCENARIO_BACKEND_BASE_URL: BACKEND_URL,
  });

  const runResponse = await fetch(`${BASE_URL}/qa/chaos/run-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scenarioIds: ["runner-smoke-5xx"] }),
  });
  assert.equal(runResponse.status, 202);
  const runPayload = await runResponse.json();
  assert.equal(runPayload.success, true);

  const finishedBatch = await pollBatch(runPayload.batch.id);
  const finishedRun = finishedBatch.runs[0];
  assert.equal(finishedRun.status, "pass");
  assert.ok(finishedRun.steps.length >= 1);
  assert.equal(finishedRun.steps[0].status, "pass");
  assert.equal(finishedRun.steps[0].details.status, 500);
});

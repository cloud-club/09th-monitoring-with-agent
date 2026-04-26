import { chaosScenarios, selectScenarios } from "../scenarios/index.mjs";
import { ADDRESS_TWO, BUYER_TWO, config, K6_SCRIPT_PATH, MUG_VARIANT } from "../lib/config.mjs";
import { ensureK6Available, sleep, spawnTracked } from "../lib/processes.mjs";
import { docker, dockerExec } from "../clients/docker-client.mjs";
import { requestBackend } from "../clients/http-client.mjs";
import {
  lookupLokiRequest,
  lookupLokiTrace,
  lookupTempoTrace,
  telemetryCompletenessBelow,
  waitForPrometheus,
} from "../clients/telemetry-client.mjs";

export async function createOrderForPayment() {
  const cartResponse = await requestBackend("POST", "/api/cart/items", {
    headers: { "x-customer-id": BUYER_TWO },
    body: { variantId: MUG_VARIANT, quantity: 1 },
  });
  if (cartResponse.status !== 201) {
    throw new Error(`cart add failed: status=${cartResponse.status}`);
  }

  const cartId = cartResponse.body?.data?.cart?.cart_id;
  const orderResponse = await requestBackend("POST", "/api/orders", {
    headers: { "x-customer-id": BUYER_TWO },
    body: { cartId, addressId: ADDRESS_TWO },
  });
  if (orderResponse.status !== 201) {
    throw new Error(`order create failed: status=${orderResponse.status}`);
  }

  return orderResponse.body?.data?.order?.order_id;
}

export async function recover() {
  for (const container of ["mwa-backend", "mwa-promtail", "mwa-tempo"]) {
    await docker("start", container);
  }
  await dockerExec("mwa-backend", ["sh", "-c", "tc qdisc del dev eth0 root 2>/dev/null || true"], 30_000);
  await dockerExec("mwa-backend", ["rm", "-f", "/tmp/mwa-scenario-runner-disk-fill.bin"], 30_000);
  console.log("Recovery complete.");
}

export async function runChaos(options) {
  if (!options.scenario || options.scenario === "true") {
    throw new Error("--scenario is required for chaos runs");
  }
  const [scenario] = selectScenarios(chaosScenarios, options.scenario);

  console.log(`Running chaos scenario: ${scenario.id}`);
  try {
    await chaosHandlers[scenario.id]();
  } finally {
    if (options.noRecover !== "true") {
      await recover();
    }
  }
}

const chaosHandlers = {
  async "service-down"() {
    await docker("stop", "mwa-backend");
    await waitForPrometheus('up{job="mwa-backend"} == bool 0', 1, 90_000);
  },

  async "cpu-pressure"() {
    const script = "const end=Date.now()+360000; while(Date.now()<end){ Math.sqrt(Math.random()*Number.MAX_SAFE_INTEGER); }";
    const workers = Number(process.env.CHAOS_CPU_WORKERS || 4);
    const children = Array.from({ length: workers }, () => spawnTracked("docker", ["exec", "mwa-backend", "node", "-e", script]));
    try {
      await waitForPrometheus('100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)', 80, 120_000);
    } finally {
      children.forEach((child) => child.kill("SIGTERM"));
    }
  },

  async "memory-pressure"() {
    const bytes = Number(process.env.CHAOS_MAX_MEMORY_BYTES || 256 * 1024 * 1024);
    const script = `const chunks=[];let left=${bytes};while(left>0){const size=Math.min(1048576,left);chunks.push(Buffer.alloc(size,1));left-=size;}setTimeout(()=>{},360000);`;
    const child = spawnTracked("docker", ["exec", "mwa-backend", "node", "-e", script]);
    try {
      await waitForPrometheus("(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100", 85, 120_000);
    } finally {
      child.kill("SIGTERM");
    }
  },

  async "db-connection-saturation"() {
    const connections = Number(process.env.CHAOS_DB_CONNECTIONS || 85);
    const children = Array.from({ length: connections }, () => (
      spawnTracked("docker", ["exec", "mwa-postgres", "psql", "-U", "mwa", "-d", "mwa", "-c", "SELECT pg_sleep(660)"])
    ));
    try {
      await waitForPrometheus("mwa:db_connections_used_ratio:5m", 0.8, 120_000);
    } finally {
      children.forEach((child) => child.kill("SIGTERM"));
    }
  },

  async "disk-fill"() {
    const megabytes = Math.max(1, Math.floor(Number(process.env.CHAOS_DISK_FILL_BYTES || 256 * 1024 * 1024) / 1024 / 1024));
    await dockerExec("mwa-backend", ["sh", "-c", `dd if=/dev/zero of=/tmp/mwa-scenario-runner-disk-fill.bin bs=1M count=${megabytes} conv=fsync`], 180_000);
    await waitForPrometheus('max(100 * (1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs",mountpoint!~"/run.*|/var/lib/docker/.*"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs",mountpoint!~"/run.*|/var/lib/docker/.*"})))', 1, 90_000);
  },

  async "network-delay"() {
    ensureK6Available();
    await dockerExec("mwa-backend", ["tc", "qdisc", "replace", "dev", "eth0", "root", "netem", "delay", "200ms"]);
    const child = spawnTracked("k6", [
      "run",
      "-e",
      `BASE_URL=${config.backendBaseUrl}`,
      "-e",
      "SCENARIO_IDS=fault-search-delay",
      "-e",
      "DURATION=6m",
      "-e",
      "VUS=4",
      K6_SCRIPT_PATH,
    ], { stdio: "inherit" });
    try {
      await waitForPrometheus("mwa:http_latency_p95_seconds:5m", 0.2, 120_000);
    } finally {
      child.kill("SIGTERM");
    }
  },

  async "metrics-off"() {
    await requestBackend("GET", "/metrics", {
      headers: { "x-mwa-fault": "metrics-off", "x-mwa-fault-delay-ms": "120000" },
      timeoutMs: 30_000,
    });
    await waitForPrometheus('up{job="mwa-backend"} == bool 0', 1, 90_000);
    await telemetryCompletenessBelow(0.9);
  },

  async "promtail-stop"() {
    const requestId = `runner-promtail-stop-${Date.now()}`;
    await docker("stop", "mwa-promtail");
    await requestBackend("GET", "/api/search?q=Notebook&page=1&limit=5", {
      headers: { "x-request-id": requestId },
    });
    await sleep(10_000);
    await lookupLokiRequest(requestId, false);
  },

  async "tempo-stop"() {
    await docker("stop", "mwa-tempo");
    const response = await requestBackend("GET", "/api/search?q=Notebook&page=1&limit=5");
    const traceId = response.headers.get("x-trace-id");
    if (!traceId) {
      throw new Error("Backend response did not include x-trace-id");
    }
    await lookupTempoTrace(traceId, false);
    await telemetryCompletenessBelow(0.9);
  },

  async "log-before-kill"() {
    const response = await requestBackend("GET", "/contract/error");
    const traceId = response.headers.get("x-trace-id");
    if (!traceId) {
      throw new Error("Backend response did not include x-trace-id");
    }
    await docker("kill", "mwa-backend");
    await docker("start", "mwa-backend");
    await waitForPrometheus('up{job="mwa-backend"}', 1, 120_000);
    await lookupLokiTrace(traceId);
  },
};

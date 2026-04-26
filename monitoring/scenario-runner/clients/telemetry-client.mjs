import { config } from "../lib/config.mjs";
import { sleep } from "../lib/processes.mjs";
import { fetchJson } from "./http-client.mjs";

function extractScalar(payload) {
  const result = Array.isArray(payload?.data?.result) ? payload.data.result : [];
  const values = result.map((entry) => Number(entry?.value?.[1])).filter(Number.isFinite);
  return values.length === 0 ? 0 : Math.max(...values);
}

export async function queryPrometheus(query) {
  const response = await fetchJson(`${config.prometheusBaseUrl}/api/v1/query?query=${encodeURIComponent(query)}`);
  return { ok: response.ok, value: extractScalar(response.body), body: response.body };
}

export async function waitForPrometheus(query, threshold, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let last = 0;
  while (Date.now() < deadline) {
    const result = await queryPrometheus(query);
    last = result.value;
    console.log(`prometheus query="${query}" value=${last} threshold=${threshold}`);
    if (result.ok && last >= threshold) {
      return last;
    }
    await sleep(config.pollIntervalMs);
  }
  throw new Error(`Prometheus threshold not reached: ${query} last=${last} threshold=${threshold}`);
}

export async function lookupTempoTrace(traceId, expectFound = true) {
  const response = await fetchJson(`${config.tempoBaseUrl}/api/traces/${encodeURIComponent(traceId)}`);
  if (expectFound && !response.ok) {
    throw new Error(`Tempo trace not found: ${traceId}`);
  }
  if (!expectFound && response.ok) {
    throw new Error(`Tempo trace unexpectedly found: ${traceId}`);
  }
  console.log(`tempo trace ${traceId} found=${response.ok}`);
}

export async function lookupLokiTrace(traceId) {
  const query = `{service_name="mwa-backend"} | json | trace_id="${traceId}"`;
  const response = await fetchJson(`${config.lokiBaseUrl}/loki/api/v1/query?query=${encodeURIComponent(query)}`);
  const count = Array.isArray(response.body?.data?.result) ? response.body.data.result.length : 0;
  if (!response.ok || count === 0) {
    throw new Error(`Loki logs not found for trace_id=${traceId}`);
  }
  console.log(`loki trace logs trace_id=${traceId} count=${count}`);
}

export async function lookupLokiRequest(requestId, expectFound = true) {
  const query = `{service_name="mwa-backend"} | json | request_id="${requestId}"`;
  const response = await fetchJson(`${config.lokiBaseUrl}/loki/api/v1/query?query=${encodeURIComponent(query)}`);
  const count = Array.isArray(response.body?.data?.result) ? response.body.data.result.length : 0;
  if (expectFound && (!response.ok || count === 0)) {
    throw new Error(`Loki logs not found for request_id=${requestId}`);
  }
  if (!expectFound && response.ok && count > 0) {
    throw new Error(`Loki logs unexpectedly found for request_id=${requestId}`);
  }
  console.log(`loki request logs request_id=${requestId} count=${count}`);
}

export async function telemetryCompletenessBelow(maximum) {
  const metrics = await fetch(`${config.backendBaseUrl}/metrics`).then((response) => response.ok).catch(() => false);
  const loki = await fetch(`${config.lokiBaseUrl}/ready`).then((response) => response.ok).catch(() => false);
  const tempo = await fetch(`${config.tempoBaseUrl}/ready`).then((response) => response.ok).catch(() => false);
  const backendUp = (await queryPrometheus('up{job="mwa-backend"}')).value >= 1;
  const ratio = [metrics, loki, tempo, backendUp].filter(Boolean).length / 4;
  console.log(`telemetry completeness probe=${ratio}`);
  if (ratio > maximum) {
    throw new Error(`Telemetry completeness did not drop below ${maximum}: ${ratio}`);
  }
}

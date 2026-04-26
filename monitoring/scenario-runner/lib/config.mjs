import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const K6_SCRIPT_PATH = resolve(ROOT_DIR, "monitoring/scenario-runner/k6/monitoring-validation.k6.js");

export const DEFAULT_SUMMARY_EXPORT = "monitoring/scenario-runner/results/summary.json";
export const DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8080";
export const DEFAULT_PROMETHEUS_BASE_URL = "http://127.0.0.1:9090";
export const DEFAULT_LOKI_BASE_URL = "http://127.0.0.1:3100";
export const DEFAULT_TEMPO_BASE_URL = "http://127.0.0.1:3200";

export const config = {
  backendBaseUrl: process.env.BASE_URL || process.env.BACKEND_BASE_URL || DEFAULT_BACKEND_BASE_URL,
  prometheusBaseUrl: process.env.PROMETHEUS_BASE_URL || DEFAULT_PROMETHEUS_BASE_URL,
  lokiBaseUrl: process.env.LOKI_BASE_URL || DEFAULT_LOKI_BASE_URL,
  tempoBaseUrl: process.env.TEMPO_BASE_URL || DEFAULT_TEMPO_BASE_URL,
  duration: process.env.DURATION || "5m",
  vus: process.env.VUS || "4",
  resetSeed: process.env.RESET_SEED || "true",
  sleepSeconds: process.env.SLEEP_SECONDS || "1",
  summaryExport: process.env.SUMMARY_EXPORT || DEFAULT_SUMMARY_EXPORT,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 15000),
};

export const BUYER_TWO = "11111111-1111-4111-8111-111111111112";
export const MUG_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
export const ADDRESS_TWO = "22222222-2222-4222-8222-222222222222";

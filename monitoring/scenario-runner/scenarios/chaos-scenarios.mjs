export const chaosScenarios = [
  {
    id: "service-down",
    description: "Stop backend, wait for Prometheus target DOWN, then recover.",
  },
  {
    id: "cpu-pressure",
    description: "Run CPU workers inside the backend container and wait for CPU pressure.",
  },
  {
    id: "memory-pressure",
    description: "Allocate bounded memory inside the backend container and wait for memory pressure.",
  },
  {
    id: "db-connection-saturation",
    description: "Hold PostgreSQL sessions and wait for DB connection saturation.",
  },
  {
    id: "disk-fill",
    description: "Create a bounded temporary file in the backend container and clean it up.",
  },
  {
    id: "network-delay",
    description: "Apply tc netem delay to backend eth0 and verify p95 latency rises.",
  },
  {
    id: "metrics-off",
    description: "Disable /metrics through backend fault injection and verify Prometheus target DOWN.",
  },
  {
    id: "promtail-stop",
    description: "Stop Promtail and verify telemetry completeness drops.",
  },
  {
    id: "tempo-stop",
    description: "Stop Tempo and verify trace lookup fails.",
  },
  {
    id: "log-before-kill",
    description: "Emit a 5xx log, kill backend, recover, and verify the trace logs exist in Loki.",
  }
];

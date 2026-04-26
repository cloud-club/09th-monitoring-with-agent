# Scenario Runner Contract

The scenario runner under `monitoring/scenario-runner` is the source of truth for monitoring validation scenarios.

## k6

- Selection precedence: `--scenario` > `SCENARIO_IDS` > `--pack` > `SCENARIO_PACK` > `smoke`
- Packs: `smoke`, `contract`, `buyer`, `fault`, `validation`, `all`
- Default target: `BASE_URL=http://127.0.0.1:8080`
- CI should run only the short smoke pack.

## Chaos

Chaos scenarios are Node runners because they need Docker, network, disk, and telemetry-store operations.

Allowed container targets are intentionally bounded:

- `mwa-backend`
- `mwa-postgres`
- `mwa-promtail`
- `mwa-tempo`

Run recovery after interrupted chaos work:

```bash
npm run monitoring:scenario:recover
```

Implementation note: the CLI entrypoint dispatches to small runner/client modules; command parsing, k6 execution, Docker control, backend HTTP calls, and telemetry lookups stay separate.

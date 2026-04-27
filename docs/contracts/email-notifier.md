# Email Notifier Contract

## Purpose

Email Notifier is the final delivery layer for AIOps incidents. It converts an incident packet and optional diagnosis into an operator-facing email report.

It is not responsible for Alertmanager webhook ingestion, evidence collection, or Grafana dashboard creation.

## Input

The backend service interface is:

```ts
notifyIncident(input: {
  incident: IncidentPacket;
  diagnosis?: DiagnosisResult;
  links?: IncidentDrilldownLinks;
  evidence?: IncidentEvidencePacket;
}): Promise<EmailDeliveryResult>;
```

`diagnosis` is used as-is when provided. If it is missing and `AIOPS_LLM_ENABLED=true`, the notifier calls the local Qwen server.

Before diagnosis resolution, incidents that pass policy and dedup are enriched with Prometheus, Loki, and Tempo evidence. Partial evidence is allowed when a source is unavailable.

## Local LLM

Default local LLM settings:

```env
AIOPS_LLM_ENABLED=false
AIOPS_LLM_BASE_URL=http://127.0.0.1:1234
AIOPS_LLM_MODEL=qwen/qwen3.6-27b
AIOPS_LLM_TIMEOUT_MS=180000
AIOPS_LLM_MAX_TOKENS=1000
AIOPS_LLM_TEMPERATURE=0.2
AIOPS_LLM_REASONING_EFFORT=none
```

The server must expose an OpenAI-compatible `POST /v1/chat/completions` API. Qwen output is parsed as strict JSON. `<think>...</think>` blocks and text outside the JSON object are stripped before parsing. `AIOPS_LLM_REASONING_EFFORT=none` is recommended for Qwen 3.6 27B because otherwise the model may spend the full token budget on reasoning and return no JSON content. If parsing fails, the notifier sends a fallback report.

The diagnosis JSON may include `incident_type_ko` and `likely_causes[].reason`. If `incident_type_ko` is missing, the renderer falls back to the MVP incident-type mapping.

## Evidence Collection

```env
AIOPS_EVIDENCE_COLLECTION_ENABLED=true
PROMETHEUS_BASE_URL=http://127.0.0.1:9090
LOKI_BASE_URL=http://127.0.0.1:3100
TEMPO_BASE_URL=http://127.0.0.1:3200
AIOPS_EVIDENCE_TIMEOUT_MS=3000
AIOPS_EVIDENCE_LOOKBACK_MINUTES=10
AIOPS_EVIDENCE_MAX_LOG_LINES=5
```

MVP evidence collection supports `payment_failure`, `checkout_latency_spike`, and `error_burst`. The collector records Prometheus key metrics and Loki/Tempo root-cause evidence before calling the LLM.

## SMTP

Email delivery is disabled by default:

```env
EMAIL_NOTIFIER_ENABLED=false
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="MWA AIOps <alerts@example.local>"
EMAIL_DEFAULT_RECIPIENTS=sre@example.local
EMAIL_PAYMENT_RECIPIENTS=payment-team@example.local,sre@example.local
EMAIL_CHECKOUT_RECIPIENTS=backend-team@example.local,sre@example.local
EMAIL_INFRA_RECIPIENTS=platform-team@example.local,sre@example.local
EMAIL_DEDUP_WINDOW_MINUTES=30
EMAIL_MIN_SEVERITY=high
```

When `EMAIL_NOTIFIER_ENABLED=false`, the module uses a no-op transport so rendering, policy, dedup, and recording paths remain testable without sending real email.

## Policy

MVP sends individual emails for:

- severity `high` or `critical`
- incident types `payment_failure`, `checkout_latency_spike`, `error_burst`

Other incidents are recorded as suppressed.

Recipients are routed by service or incident type. Payment incidents add `EMAIL_PAYMENT_RECIPIENTS`, checkout incidents add `EMAIL_CHECKOUT_RECIPIENTS`, and infra incidents add `EMAIL_INFRA_RECIPIENTS`; defaults are always included.

## Dedup

The dedup key combines:

- fingerprint
- incident type
- service name
- severity
- configured time bucket

If a sent record already exists for the same fingerprint and dedup key, the next event is recorded as `suppressed` with `dedup_suppressed=true`.

## Report Format

Email subjects use:

```text
[{{SEVERITY}}] {{service_name}} - {{incident_type_ko}} / {{one_line_summary}}
```

Normal reports render the operator incident report format:

1. summary
2. customer impact
3. confirmed evidence
4. key metrics from Prometheus
5. likely causes, including confidence and evidence-linked reason
6. immediate actions
7. follow-up checks
8. Grafana/Loki/Tempo/alert links
9. notes

Fallback reports render the compact format:

1. basic summary
2. currently confirmed information, including key metrics when available
3. immediate drilldown links
4. notes

Partial evidence and collection warnings are merged into the notes section. Confirmed evidence and likely causes are always rendered as separate sections in normal reports.

## Risk Controls

- Summary is limited to 2-3 sentences.
- Confirmed evidence, immediate actions, and follow-up checks are limited to 3 items.
- Likely causes are limited to 2 items.
- Raw stack traces, long dumps, tokens, passwords, API keys, and email addresses are masked or omitted from the body.
- Links keep drilldown behavior but sensitive or oversized query parameter values are masked.
- LLM output is rejected when it provides likely causes without confirmed evidence, is structurally invalid, is too verbose, or uses overconfident cause language.
- Partial evidence is allowed; failed evidence sources are shown in notes instead of blocking the report.

## Metrics

The notifier exports:

- `mwa_email_render_total{result}`
- `mwa_email_send_total{result}`
- `mwa_email_dedup_suppressed_total`
- `mwa_email_fallback_total`
- `mwa_aiops_llm_diagnosis_total{result}`
- `mwa_incident_to_email_latency_seconds`

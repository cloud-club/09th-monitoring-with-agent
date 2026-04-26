# Telemetry Contract

## Metrics

- API RED metric labels stay low cardinality: `service`, `handler`, `method`, `status_code`.
- Business metrics use bounded result labels such as `success`, `validation_error`, `conflict`, `failed`.
- Entity IDs such as `product_id`, `cart_id`, `order_id`, `payment_id` are logs-only and must not become metric labels.

Important backend metric families:

- `mwa_http_requests_total`
- `mwa_http_request_duration_seconds`
- `mwa_search_requests_total`
- `mwa_cart_add_total`
- `mwa_order_create_total`
- `mwa_payment_attempt_total`
- `mwa_payment_processing_latency_seconds`
- `mwa_log_heartbeat_unixtime_seconds`

## Logs

Structured logs are JSON records with these canonical fields:

- `timestamp`
- `level`
- `service`
- `environment`
- `request_id`
- `trace_id`
- `endpoint`
- `method`
- `result`
- `user_role`
- `customer_id`
- `event_name`
- `error_code`

Domain identifiers may appear in logs as fields, not metric labels.

## Fault Injection

Fault injection is local/demo only and requires `QA_FAULT_INJECTION_ENABLED=true`.

Supported headers:

- `x-mwa-fault: error | delay | timeout | unhandled | health-5xx | metrics-off`
- `x-mwa-fault-delay-ms: <milliseconds>`

Allowed targets:

- `/api/search`
- `/api/cart/items`
- `/api/orders`
- `/api/orders/:orderId/payment-attempts`
- `/health`
- `/metrics`

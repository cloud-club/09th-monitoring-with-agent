const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");
const { pathToFileURL } = require("url");
const express = require("express");
const morgan = require("morgan");
const client = require("prom-client");
const { prisma, isPrismaEnabled } = require("./prisma-client");

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const LOG_DIR = process.env.LOG_DIR || "/app/logs";
const LOG_ACCESS = path.join(LOG_DIR, "mwa-access.log");
const LOG_APP = path.join(LOG_DIR, "mwa-app.log");
const SCENARIO_BACKEND_BASE_URL = process.env.SCENARIO_BACKEND_BASE_URL || process.env.BACKEND_BASE_URL || "http://127.0.0.1:8080";
const MONITORING_PROMETHEUS_BASE_URL = process.env.MONITORING_PROMETHEUS_BASE_URL || "http://127.0.0.1:9090";
const MONITORING_LOKI_BASE_URL = process.env.MONITORING_LOKI_BASE_URL || "http://127.0.0.1:3100";
const MONITORING_GRAFANA_BASE_URL = process.env.MONITORING_GRAFANA_BASE_URL || "http://127.0.0.1:3000";
const SCENARIO_RESET_SEED_ENABLED = process.env.SCENARIO_RESET_SEED_ENABLED !== "false";
const QA_CHAOS_ENABLED = process.env.QA_CHAOS_ENABLED === "true";
const QA_K6_RUNNER_ENABLED = process.env.QA_K6_RUNNER_ENABLED === "true";
const K6_SCENARIO_PACK_DEFAULT = process.env.K6_SCENARIO_PACK_DEFAULT || "smoke";
const K6_SCENARIO_CATALOG_PATHS = [
  process.env.K6_SCENARIO_CATALOG_PATH,
  path.join(__dirname, "monitoring/scenario-runner/scenarios/k6-scenarios.mjs"),
  path.join(__dirname, "../scenario-runner/scenarios/k6-scenarios.mjs"),
].filter(Boolean);
const K6_SUMMARY_PATHS = [
  process.env.K6_SUMMARY_PATH,
  path.join(__dirname, "monitoring/scenario-runner/results/summary.json"),
  path.join(__dirname, "../scenario-runner/results/summary.json"),
].filter(Boolean);
const K6_RUNNER_CLI_PATHS = [
  process.env.K6_RUNNER_CLI_PATH,
  path.join(__dirname, "monitoring/scenario-runner/cli/run-scenario.mjs"),
  path.join(__dirname, "../scenario-runner/cli/run-scenario.mjs"),
].filter(Boolean);
const CHAOS_MAX_MEMORY_BYTES = Number(process.env.CHAOS_MAX_MEMORY_BYTES || 256 * 1024 * 1024);
const CHAOS_POLL_INTERVAL_MS = Number(process.env.CHAOS_POLL_INTERVAL_MS || 15000);
const CHAOS_RUN_RETENTION_MS = Number(process.env.CHAOS_RUN_RETENTION_MS || 60 * 60 * 1000);
const CHAOS_DEFAULT_HOLD_MS = Number(process.env.CHAOS_DEFAULT_HOLD_MS || 6 * 60 * 1000);
const CHAOS_LONG_HOLD_MS = Number(process.env.CHAOS_LONG_HOLD_MS || 11 * 60 * 1000);
const CHAOS_ALLOWED_CONTAINERS = new Set(["mwa-backend", "mwa-postgres", "mwa-promtail", "mwa-tempo"]);
const CHAOS_DISK_FILL_BYTES = Number(process.env.CHAOS_DISK_FILL_BYTES || 256 * 1024 * 1024);
const CHAOS_AVERAGE_ORDER_VALUE_WON = Number(process.env.CHAOS_AVERAGE_ORDER_VALUE_WON || 8267);

fs.mkdirSync(LOG_DIR, { recursive: true });

const KPI_RESULT_LABELS = Object.freeze({
  success: "success",
  failure: "failure",
});

const KPI_DRILLDOWN_TARGETS = Object.freeze({
  prometheus: "prometheus",
  loki: "loki",
  grafana: "grafana",
});

const KPI_TELEMETRY_ENDPOINTS = Object.freeze([
  Object.freeze({ metricFamily: "mwa_search_requests_total", eventNames: ["search.executed"] }),
  Object.freeze({ metricFamily: "mwa_http_requests_total", metricText: 'handler="/api/catalog/products/:productId"', eventNames: ["product.detail_viewed"] }),
  Object.freeze({ metricFamily: "mwa_cart_add_total", eventNames: ["cart.item_added"] }),
  Object.freeze({ metricFamily: "mwa_order_create_total", eventNames: ["order.created"] }),
  Object.freeze({ metricFamily: "mwa_payment_attempt_total", eventNames: ["payment.started", "payment.failed", "payment.succeeded"] }),
]);

const KPI_ALERT_RULES = Object.freeze({
  payment: ["PaymentFailureSpike"],
  order: ["OrderCreateFailures"],
  api: ["APIHighErrorRate", "APIHighLatencyP95", "SearchLatencySLOViolation"],
});

const KPI_STATE = {
  scenarioRunsTotal: 0,
  scenarioRunsPassed: 0,
  summaryGenerationsTotal: 0,
  summaryGenerationsSucceeded: 0,
  drilldownChecksTotal: 0,
  drilldownChecksSucceeded: 0,
  alertCoverageChecksTotal: 0,
  alertCoverageChecksSucceeded: 0,
  actionableIncidentChecksTotal: 0,
  actionableIncidentChecksSucceeded: 0,
  falsePositiveRunsTotal: 0,
};

let currentTelemetryCompletenessRatio = 0;

/**
 * 데모용 고정 상품(카탈로그).
 * id 접두사 sku = Stock Keeping Unit(재고·품목 관리용 코드, 매장/쇼핑몰에서 흔히 쓰는 품번). 화면에는 한글 이름만 노출.
 * 메트릭 라벨 product_id 로 쓰이므로 짧고 고정된 값만 둠.
 */
const PRODUCTS = [
  { id: "sku-notebook", name: "클라우드클럽 노트", price: 12000 },
  { id: "sku-mug", name: "MWA 머그컵", price: 8900 },
  { id: "sku-sticker", name: "데브옵스 스티커 팩", price: 3500 },
];

const SCENARIO_TEMPLATES = [
  {
    id: "health-success",
    name: "Health success",
    description: "백엔드 health 계약을 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "health",
        label: "GET /health",
        method: "GET",
        path: "/health",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "success", equals: true },
          { type: "json_path", path: "data.status", equals: "ok" },
        ],
      },
    ],
  },
  {
    id: "metrics-text-check",
    name: "Metrics text contract",
    description: "Prometheus metrics 텍스트 응답과 핵심 메트릭 이름을 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "metrics",
        label: "GET /metrics",
        method: "GET",
        path: "/metrics",
        assertions: [
          { type: "status", equals: 200 },
          { type: "content_type_includes", value: "text/plain" },
          { type: "text_includes", value: "mwa_http_requests_total" },
        ],
      },
    ],
  },
  {
    id: "health-metrics-parallel",
    name: "Health + metrics parallel",
    description: "health와 metrics를 병렬로 실행해 결과 집계를 확인합니다.",
    mode: "parallel",
    steps: [
      {
        id: "health",
        label: "GET /health",
        method: "GET",
        path: "/health",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "success", equals: true },
          { type: "json_path", path: "data.status", equals: "ok" },
        ],
      },
      {
        id: "metrics",
        label: "GET /metrics",
        method: "GET",
        path: "/metrics",
        assertions: [
          { type: "status", equals: 200 },
          { type: "content_type_includes", value: "text/plain" },
          { type: "text_includes", value: "mwa_http_requests_total" },
        ],
      },
    ],
  },
  {
    id: "catalog-list-success",
    name: "Catalog list success",
    description: "시드된 catalog 목록 응답과 pagination 값을 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "catalog-list",
        label: "GET /api/catalog/products?page=1&limit=2&sort=newest",
        method: "GET",
        path: "/api/catalog/products?page=1&limit=2&sort=newest",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "success", equals: true },
          { type: "json_path", path: "meta.pagination.page", equals: 1 },
          { type: "json_path", path: "meta.pagination.limit", equals: 2 },
          { type: "json_path", path: "meta.pagination.total", equals: 6 },
          { type: "json_path", path: "data.items.0.product_id", equals: "77777777-7777-4777-8777-777777777771" },
          { type: "json_path", path: "data.items.0.title", equals: "Monitoring Notebook" },
        ],
      },
    ],
  },
  {
    id: "catalog-price-sort",
    name: "Catalog price ascending",
    description: "가격 오름차순 정렬에서 가장 저렴한 상품이 먼저 오는지 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "catalog-price-asc",
        label: "GET /api/catalog/products?sort=price_asc",
        method: "GET",
        path: "/api/catalog/products?sort=price_asc",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "success", equals: true },
          { type: "json_path", path: "data.items.0.product_id", equals: "77777777-7777-4777-8777-777777777773" },
          { type: "json_path", path: "data.items.0.title", equals: "Alert Sticker Pack" },
          { type: "json_path", path: "data.items.0.price_summary.lowest_current_price", equals: "5900.00" },
        ],
      },
    ],
  },
  {
    id: "catalog-product-not-found",
    name: "Catalog product not found",
    description: "존재하지 않는 상품 id 조회 시 NOT_FOUND 계약을 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "catalog-product-missing",
        label: "GET /api/catalog/products/00000000-0000-4000-8000-000000000009",
        method: "GET",
        path: "/api/catalog/products/00000000-0000-4000-8000-000000000009",
        assertions: [
          { type: "status", equals: 404 },
          { type: "json_path", path: "error.code", equals: "NOT_FOUND" },
          { type: "json_path", path: "error.message", equals: "Catalog product not found" },
        ],
      },
    ],
  },
  {
    id: "search-notebook-success",
    name: "Search Notebook success",
    description: "검색 API가 Notebook fixture를 반환하는지 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "search-notebook",
        label: "GET /api/search?q=Notebook&page=1&limit=5",
        method: "GET",
        path: "/api/search?q=Notebook&page=1&limit=5",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "success", equals: true },
          { type: "json_path", path: "meta.pagination.page", equals: 1 },
          { type: "json_path", path: "data.items.0.product_id", equals: "77777777-7777-4777-8777-777777777771" },
          { type: "json_path", path: "data.items.0.title", equals: "Monitoring Notebook" },
        ],
      },
    ],
  },
  {
    id: "search-zero-result",
    name: "Search zero result",
    description: "검색 결과가 없을 때 빈 결과와 pagination 값이 맞는지 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "search-zero-result",
        label: "GET /api/search?q=zzz&page=1&limit=20",
        method: "GET",
        path: "/api/search?q=zzz&page=1&limit=20",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "success", equals: true },
          { type: "json_path", path: "meta.pagination.total", equals: 0 },
          { type: "json_path", path: "meta.pagination.totalPages", equals: 1 },
        ],
      },
    ],
  },
  {
    id: "search-validation-failure",
    name: "Search validation failure",
    description: "검색어 길이 검증 실패 시 400 오류 계약을 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "search-validation",
        label: "GET /api/search?q=a&page=1&limit=5",
        method: "GET",
        path: "/api/search?q=a&page=1&limit=5",
        assertions: [
          { type: "status", equals: 400 },
          { type: "json_path", path: "success", equals: false },
          { type: "json_path", path: "error.code", equals: "VALIDATION_ERROR" },
          { type: "json_path", path: "error.message", equals: "Request validation failed" },
        ],
      },
    ],
  },
  {
    id: "recommendation-success",
    name: "Notebook recommendations",
    description: "추천 API가 정상 응답을 반환하는지 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "recommendation",
        label: "GET /api/catalog/products/77777777-7777-4777-8777-777777777771/recommendations?limit=2",
        method: "GET",
        path: "/api/catalog/products/77777777-7777-4777-8777-777777777771/recommendations?limit=2",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "success", equals: true },
        ],
      },
    ],
  },
  {
    id: "recommendation-limit-validation",
    name: "Recommendation limit validation",
    description: "추천 limit가 범위를 넘을 때 validation failure를 반환하는지 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "recommendation-limit-invalid",
        label: "GET /api/catalog/products/77777777-7777-4777-8777-777777777771/recommendations?limit=5",
        method: "GET",
        path: "/api/catalog/products/77777777-7777-4777-8777-777777777771/recommendations?limit=5",
        assertions: [
          { type: "status", equals: 400 },
          { type: "json_path", path: "error.code", equals: "VALIDATION_ERROR" },
          { type: "json_path", path: "error.message", equals: "Request validation failed" },
        ],
      },
    ],
  },
  {
    id: "buyer-success-funnel",
    name: "Buyer success funnel",
    description: "상품 조회 → 장바구니 → 주문 → 결제 성공까지 buyer 성공 시나리오를 검증합니다.",
    mode: "sequential",
    steps: [
      {
        id: "productList",
        label: "GET /api/catalog/products?page=1&limit=2",
        method: "GET",
        path: "/api/catalog/products?page=1&limit=2",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "data.items.0.product_id", equals: "77777777-7777-4777-8777-777777777771" },
        ],
      },
      {
        id: "productDetail",
        label: "GET /api/catalog/products/77777777-7777-4777-8777-777777777771",
        method: "GET",
        path: "/api/catalog/products/77777777-7777-4777-8777-777777777771",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "data.product.product_id", equals: "77777777-7777-4777-8777-777777777771" },
        ],
      },
      {
        id: "recommendations",
        label: "GET recommendations",
        method: "GET",
        path: "/api/catalog/products/77777777-7777-4777-8777-777777777771/recommendations?limit=2",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "success", equals: true },
        ],
      },
      {
        id: "cartAdd",
        label: "POST /api/cart/items",
        method: "POST",
        path: "/api/cart/items",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111111",
          "x-request-id": "ui-success-cart-add-{{runtime.runId}}",
        },
        body: {
          variantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          quantity: 1,
        },
        assertions: [
          { type: "status", equals: 201 },
          { type: "json_path", path: "success", equals: true },
          { type: "json_path", path: "data.cart.customer_id", equals: "11111111-1111-4111-8111-111111111111" },
        ],
      },
      {
        id: "cartUpdate",
        label: "PATCH /api/cart/items/:cartItemId",
        method: "PATCH",
        path: "/api/cart/items/{{steps.cartAdd.body.data.cart.items.0.cart_item_id}}",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111111",
          "x-request-id": "ui-success-cart-update-{{runtime.runId}}",
        },
        body: {
          quantity: 2,
        },
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "data.cart.items.0.quantity", equals: 2 },
        ],
      },
      {
        id: "orderCreate",
        label: "POST /api/orders",
        method: "POST",
        path: "/api/orders",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111111",
          "x-request-id": "ui-success-order-{{runtime.runId}}",
        },
        body: {
          cartId: "{{steps.cartUpdate.body.data.cart.cart_id}}",
          addressId: "22222222-2222-4222-8222-222222222221",
        },
        assertions: [
          { type: "status", equals: 201 },
          { type: "json_path", path: "data.order.status", equals: "pending_payment" },
        ],
      },
      {
        id: "paymentCreate",
        label: "POST /api/orders/:orderId/payment-attempts",
        method: "POST",
        path: "/api/orders/{{steps.orderCreate.body.data.order.order_id}}/payment-attempts",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111111",
          "x-request-id": "ui-success-payment-{{runtime.runId}}",
        },
        body: {
          requestKey: "ui-success-{{runtime.runId}}",
          outcome: "success",
        },
        assertions: [
          { type: "status", equals: 201 },
          { type: "json_path", path: "data.attempt.status", equals: "succeeded" },
        ],
      },
      {
        id: "orderAfter",
        label: "GET /api/orders/:orderId",
        method: "GET",
        path: "/api/orders/{{steps.orderCreate.body.data.order.order_id}}",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111111",
          "x-request-id": "ui-success-order-after-{{runtime.runId}}",
        },
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "data.order.status", equals: "paid" },
        ],
      },
    ],
  },
  {
    id: "buyer-failure-funnel",
    name: "Buyer failure funnel",
    description: "상품 조회 → 장바구니 → 주문 → 결제 실패까지 buyer 실패 시나리오를 검증합니다.",
    mode: "sequential",
    steps: [
      {
        id: "searchNotebook",
        label: "GET /api/search?q=Notebook&page=1&limit=20",
        method: "GET",
        path: "/api/search?q=Notebook&page=1&limit=20",
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "data.items.0.product_id", equals: "77777777-7777-4777-8777-777777777771" },
        ],
      },
      {
        id: "failureCartAdd",
        label: "POST /api/cart/items",
        method: "POST",
        path: "/api/cart/items",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-failure-cart-add-{{runtime.runId}}",
        },
        body: {
          variantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          quantity: 1,
        },
        assertions: [
          { type: "status", equals: 201 },
          { type: "json_path", path: "success", equals: true },
        ],
      },
      {
        id: "failureCartUpdate",
        label: "PATCH /api/cart/items/:cartItemId",
        method: "PATCH",
        path: "/api/cart/items/{{steps.failureCartAdd.body.data.cart.items.0.cart_item_id}}",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-failure-cart-update-{{runtime.runId}}",
        },
        body: {
          quantity: 2,
        },
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "data.cart.items.0.quantity", equals: 2 },
        ],
      },
      {
        id: "failureOrderCreate",
        label: "POST /api/orders",
        method: "POST",
        path: "/api/orders",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-failure-order-{{runtime.runId}}",
        },
        body: {
          cartId: "{{steps.failureCartUpdate.body.data.cart.cart_id}}",
          addressId: "22222222-2222-4222-8222-222222222222",
        },
        assertions: [
          { type: "status", equals: 201 },
          { type: "json_path", path: "data.order.status", equals: "pending_payment" },
        ],
      },
      {
        id: "failurePaymentCreate",
        label: "POST /api/orders/:orderId/payment-attempts fail",
        method: "POST",
        path: "/api/orders/{{steps.failureOrderCreate.body.data.order.order_id}}/payment-attempts",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-failure-payment-{{runtime.runId}}",
        },
        body: {
          requestKey: "ui-failure-{{runtime.runId}}",
          outcome: "fail",
          failureCode: "CARD_DECLINED",
        },
        assertions: [
          { type: "status", equals: 201 },
          { type: "json_path", path: "data.attempt.status", equals: "failed" },
        ],
      },
      {
        id: "failureOrderAfter",
        label: "GET /api/orders/:orderId",
        method: "GET",
        path: "/api/orders/{{steps.failureOrderCreate.body.data.order.order_id}}",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-failure-order-after-{{runtime.runId}}",
        },
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "data.order.status", equals: "payment_failed" },
        ],
      },
    ],
  },
  {
    id: "buyer-cart-validation-failure",
    name: "Buyer cart validation failure",
    description: "기존 장바구니 아이템 수량을 0으로 수정해 validation failure를 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "buyerOneCart",
        label: "GET /api/cart",
        method: "GET",
        path: "/api/cart",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111111",
          "x-request-id": "ui-cart-validation-cart-{{runtime.runId}}",
        },
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "data.cart.items.0.cart_item_id", equals: "44444444-4444-4444-8444-444444444441" },
        ],
      },
      {
        id: "buyerOneCartInvalidPatch",
        label: "PATCH /api/cart/items/:cartItemId quantity=0",
        method: "PATCH",
        path: "/api/cart/items/{{steps.buyerOneCart.body.data.cart.items.0.cart_item_id}}",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111111",
          "x-request-id": "ui-cart-validation-patch-{{runtime.runId}}",
        },
        body: {
          quantity: 0,
        },
        assertions: [
          { type: "status", equals: 400 },
          { type: "json_path", path: "error.code", equals: "VALIDATION_ERROR" },
          { type: "json_path", path: "error.message", equals: "Request validation failed" },
        ],
      },
    ],
  },
  {
    id: "buyer-cart-add-delete-roundtrip",
    name: "Buyer cart add/delete roundtrip",
    description: "빈 장바구니에서 상품을 추가한 뒤 같은 라인을 삭제하는 생성/삭제 시나리오를 검증합니다.",
    mode: "sequential",
    steps: [
      {
        id: "buyerTwoCartBeforeAdd",
        label: "GET /api/cart (buyer two)",
        method: "GET",
        path: "/api/cart",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-cart-roundtrip-get-{{runtime.runId}}",
        },
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "data.cart.customer_id", equals: "11111111-1111-4111-8111-111111111112" },
        ],
      },
      {
        id: "buyerTwoCartAdd",
        label: "POST /api/cart/items (mug)",
        method: "POST",
        path: "/api/cart/items",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-cart-roundtrip-add-{{runtime.runId}}",
        },
        body: {
          variantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          quantity: 1,
        },
        assertions: [
          { type: "status", equals: 201 },
          { type: "json_path", path: "success", equals: true },
          { type: "json_path", path: "data.cart.items.0.variant_id", equals: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2" },
        ],
      },
      {
        id: "buyerTwoCartDelete",
        label: "DELETE /api/cart/items/:cartItemId",
        method: "DELETE",
        path: "/api/cart/items/{{steps.buyerTwoCartAdd.body.data.cart.items.0.cart_item_id}}",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-cart-roundtrip-delete-{{runtime.runId}}",
        },
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "success", equals: true },
          { type: "json_path", path: "data.cart.customer_id", equals: "11111111-1111-4111-8111-111111111112" },
        ],
      },
    ],
  },
  {
    id: "buyer-empty-cart-checkout-conflict",
    name: "Buyer empty cart checkout conflict",
    description: "빈 장바구니로 checkout을 시도할 때 conflict를 반환하는지 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "buyerTwoCart",
        label: "GET /api/cart (buyer two)",
        method: "GET",
        path: "/api/cart",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-empty-cart-load-{{runtime.runId}}",
        },
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "data.cart.customer_id", equals: "11111111-1111-4111-8111-111111111112" },
        ],
      },
      {
        id: "buyerTwoEmptyCheckout",
        label: "POST /api/orders with empty cart",
        method: "POST",
        path: "/api/orders",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-empty-cart-checkout-{{runtime.runId}}",
        },
        body: {
          cartId: "{{steps.buyerTwoCart.body.data.cart.cart_id}}",
          addressId: "22222222-2222-4222-8222-222222222222",
        },
        assertions: [
          { type: "status", equals: 409 },
          { type: "json_path", path: "error.code", equals: "STATE_CONFLICT" },
        ],
      },
    ],
  },
  {
    id: "buyer-payment-validation-failure",
    name: "Buyer payment validation failure",
    description: "결제 실패 요청에서 failureCode가 없을 때 validation failure를 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "buyerPaymentValidation",
        label: "POST /api/orders/55555555-5555-4555-8555-555555555552/payment-attempts fail without failureCode",
        method: "POST",
        path: "/api/orders/55555555-5555-4555-8555-555555555552/payment-attempts",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-payment-validation-{{runtime.runId}}",
        },
        body: {
          requestKey: "ui-pay-validation-{{runtime.runId}}",
          outcome: "fail",
        },
        assertions: [
          { type: "status", equals: 400 },
          { type: "json_path", path: "error.code", equals: "VALIDATION_ERROR" },
          { type: "json_path", path: "error.message", equals: "Request validation failed" },
        ],
      },
    ],
  },
  {
    id: "buyer-cross-order-access-denied",
    name: "Buyer cross-order access denied",
    description: "다른 고객의 주문을 조회할 때 NOT_FOUND를 반환하는지 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "buyerCrossOrderRead",
        label: "GET /api/orders/55555555-5555-4555-8555-555555555551 as buyer two",
        method: "GET",
        path: "/api/orders/55555555-5555-4555-8555-555555555551",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-cross-order-read-{{runtime.runId}}",
        },
        assertions: [
          { type: "status", equals: 404 },
          { type: "json_path", path: "error.code", equals: "NOT_FOUND" },
          { type: "json_path", path: "error.message", equals: "Order not found" },
        ],
      },
    ],
  },
  {
    id: "route-not-found",
    name: "Route not found",
    description: "존재하지 않는 backend route의 JSON 404 계약을 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "missing-route",
        label: "GET /route-that-does-not-exist",
        method: "GET",
        path: "/route-that-does-not-exist",
        assertions: [
          { type: "status", equals: 404 },
          { type: "content_type_includes", value: "application/json" },
          { type: "json_path", path: "error.code", equals: "NOT_FOUND" },
          { type: "json_path", path: "error.message", equals: "Route not found" },
        ],
      },
    ],
  },
  {
    id: "fault-search-delay",
    name: "Fault search delay",
    description: "검색 API에 QA delay fault를 주입해 endpoint latency 계측을 검증합니다.",
    mode: "sequential",
    steps: [
      {
        id: "searchDelay",
        label: "GET /api/search with x-mwa-fault=delay",
        method: "GET",
        path: "/api/search?q=Notebook&page=1&limit=5",
        headers: {
          "x-request-id": "ui-fault-search-delay-{{runtime.runId}}",
          "x-mwa-fault": "delay",
          "x-mwa-fault-delay-ms": "1000",
        },
        timeoutMs: 5000,
        assertions: [
          { type: "status", equals: 200 },
          { type: "json_path", path: "success", equals: true },
        ],
      },
    ],
  },
  {
    id: "fault-search-error",
    name: "Fault search error",
    description: "검색 API에 QA error fault를 주입해 5xx와 trace/log drilldown을 검증합니다.",
    mode: "sequential",
    steps: [
      {
        id: "searchError",
        label: "GET /api/search with x-mwa-fault=error",
        method: "GET",
        path: "/api/search?q=Notebook&page=1&limit=5",
        headers: {
          "x-request-id": "ui-fault-search-error-{{runtime.runId}}",
          "x-mwa-fault": "error",
        },
        assertions: [
          { type: "status", equals: 500 },
          { type: "json_path", path: "error.code", equals: "INTERNAL_SERVER_ERROR" },
        ],
      },
    ],
  },
  {
    id: "fault-cart-delay",
    name: "Fault cart add delay",
    description: "장바구니 추가 API에 QA delay fault를 주입합니다.",
    mode: "sequential",
    steps: [
      {
        id: "cartAddDelay",
        label: "POST /api/cart/items with x-mwa-fault=delay",
        method: "POST",
        path: "/api/cart/items",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-fault-cart-delay-{{runtime.runId}}",
          "x-mwa-fault": "delay",
          "x-mwa-fault-delay-ms": "1000",
        },
        timeoutMs: 5000,
        body: {
          variantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          quantity: 1,
        },
        assertions: [
          { type: "status", equals: 201 },
          { type: "json_path", path: "success", equals: true },
        ],
      },
    ],
  },
  {
    id: "fault-order-delay",
    name: "Fault order delay",
    description: "주문 생성 API에 QA delay fault를 주입합니다.",
    mode: "sequential",
    steps: [
      {
        id: "cartAddForOrderDelay",
        label: "POST /api/cart/items",
        method: "POST",
        path: "/api/cart/items",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-fault-order-cart-{{runtime.runId}}",
        },
        body: {
          variantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          quantity: 1,
        },
        assertions: [
          { type: "status", equals: 201 },
        ],
      },
      {
        id: "orderDelay",
        label: "POST /api/orders with x-mwa-fault=delay",
        method: "POST",
        path: "/api/orders",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-fault-order-delay-{{runtime.runId}}",
          "x-mwa-fault": "delay",
          "x-mwa-fault-delay-ms": "1000",
        },
        timeoutMs: 5000,
        body: {
          cartId: "{{steps.cartAddForOrderDelay.body.data.cart.cart_id}}",
          addressId: "22222222-2222-4222-8222-222222222222",
        },
        assertions: [
          { type: "status", equals: 201 },
          { type: "json_path", path: "data.order.status", equals: "pending_payment" },
        ],
      },
    ],
  },
  {
    id: "fault-payment-delay",
    name: "Fault payment delay",
    description: "결제 API에 QA delay fault를 주입합니다.",
    mode: "sequential",
    steps: [
      {
        id: "cartAddForPaymentDelay",
        label: "POST /api/cart/items",
        method: "POST",
        path: "/api/cart/items",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-fault-payment-cart-{{runtime.runId}}",
        },
        body: {
          variantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          quantity: 1,
        },
        assertions: [
          { type: "status", equals: 201 },
        ],
      },
      {
        id: "orderForPaymentDelay",
        label: "POST /api/orders",
        method: "POST",
        path: "/api/orders",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-fault-payment-order-{{runtime.runId}}",
        },
        body: {
          cartId: "{{steps.cartAddForPaymentDelay.body.data.cart.cart_id}}",
          addressId: "22222222-2222-4222-8222-222222222222",
        },
        assertions: [
          { type: "status", equals: 201 },
        ],
      },
      {
        id: "paymentDelay",
        label: "POST /api/orders/:orderId/payment-attempts with x-mwa-fault=delay",
        method: "POST",
        path: "/api/orders/{{steps.orderForPaymentDelay.body.data.order.order_id}}/payment-attempts",
        headers: {
          "x-customer-id": "11111111-1111-4111-8111-111111111112",
          "x-request-id": "ui-fault-payment-delay-{{runtime.runId}}",
          "x-mwa-fault": "delay",
          "x-mwa-fault-delay-ms": "1000",
        },
        timeoutMs: 5000,
        body: {
          requestKey: "ui-fault-payment-delay-{{runtime.runId}}",
          outcome: "success",
        },
        assertions: [
          { type: "status", equals: 201 },
          { type: "json_path", path: "data.attempt.status", equals: "succeeded" },
        ],
      },
    ],
  },
  {
    id: "fault-unhandled-exception",
    name: "Fault unhandled exception",
    description: "QA unhandled fault로 stack trace와 5xx 로그를 검증합니다.",
    mode: "sequential",
    steps: [
      {
        id: "unhandledSearch",
        label: "GET /api/search with x-mwa-fault=unhandled",
        method: "GET",
        path: "/api/search?q=Notebook&page=1&limit=5",
        headers: {
          "x-request-id": "ui-fault-unhandled-{{runtime.runId}}",
          "x-mwa-fault": "unhandled",
        },
        assertions: [
          { type: "status", equals: 500 },
          { type: "json_path", path: "error.code", equals: "INTERNAL_SERVER_ERROR" },
        ],
      },
    ],
  },
  {
    id: "label-coverage-missing-buyer",
    name: "Label coverage missing buyer",
    description: "필수 buyer header 누락 요청으로 user_role/customer_id 커버리지 하락을 검증합니다.",
    mode: "sequential",
    steps: [
      {
        id: "missingCustomer",
        label: "POST /api/cart/items without x-customer-id",
        method: "POST",
        path: "/api/cart/items",
        headers: {
          "x-request-id": "ui-label-missing-customer-{{runtime.runId}}",
        },
        body: {
          variantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          quantity: 1,
        },
        assertions: [
          { type: "status", equals: 401 },
          { type: "json_path", path: "error.code", equals: "UNAUTHORIZED_CUSTOMER" },
        ],
      },
    ],
  },
];

const ALLOWED_SCENARIO_PATH_PATTERNS = [
  /^\/health$/,
  /^\/metrics$/,
  /^\/route-that-does-not-exist$/,
  /^\/contract\/error$/,
  /^\/api\/search(?:\?.*)?$/,
  /^\/api\/cart$/,
  /^\/api\/cart\/items$/,
  /^\/api\/cart\/items\/[^/?#]+$/,
  /^\/api\/catalog\/products(?:\?.*)?$/,
  /^\/api\/catalog\/products\/[^/?#]+\/recommendations(?:\?.*)?$/,
  /^\/api\/catalog\/products\/[^/?#]+$/,
  /^\/api\/orders$/,
  /^\/api\/orders\/[^/?#]+$/,
  /^\/api\/orders\/[^/?#]+\/payment-attempts$/,
];

const CHAOS_SCENARIOS = [
  {
    id: "runner-smoke-5xx",
    name: "Runner smoke 5xx",
    description: "Fast executable smoke test for the chaos runner using one expected 500 request.",
    expectedAlert: null,
    estimatedDurationMs: 10_000,
    steps: [
      { type: "http", path: "/contract/error", method: "GET", expectStatus: 500, timeoutMs: 10_000 },
    ],
  },
  {
    id: "api-5xx-error-rate",
    name: "API 5xx error rate",
    description: "Calls /contract/error long enough for APIHighErrorRate to fire.",
    expectedAlert: "APIHighErrorRate",
    estimatedDurationMs: CHAOS_DEFAULT_HOLD_MS + 90_000,
    steps: [
      { type: "load", path: "/contract/error", method: "GET", durationMs: CHAOS_DEFAULT_HOLD_MS, concurrency: 4, intervalMs: 250, expectStatus: 500 },
      { type: "waitForAlert", alertName: "APIHighErrorRate", timeoutMs: 2 * 60 * 1000 },
      { type: "tempoTrace", statusCode: 500 },
    ],
  },
  {
    id: "api-high-latency-p95",
    name: "API high latency p95",
    description: "Combines DB sleeps and HTTP load until APIHighLatencyP95 fires.",
    expectedAlert: "APIHighLatencyP95",
    estimatedDurationMs: CHAOS_DEFAULT_HOLD_MS + 2 * 60 * 1000,
    steps: [
      { type: "db", action: "sleep-load", durationMs: CHAOS_DEFAULT_HOLD_MS, connections: 8, sleepSeconds: 3 },
      { type: "load", path: "/api/catalog/products?page=1&limit=2&sort=newest", method: "GET", durationMs: CHAOS_DEFAULT_HOLD_MS, concurrency: 8, intervalMs: 100, expectStatus: 200 },
      { type: "waitForPrometheus", query: "mwa:http_latency_p95_seconds:5m", threshold: 1, timeoutMs: 2 * 60 * 1000 },
      { type: "waitForAlert", alertName: "APIHighLatencyP95", timeoutMs: 2 * 60 * 1000 },
      { type: "tempoTrace", statusCode: 200 },
    ],
  },
  {
    id: "service-down",
    name: "Service down",
    description: "Stops mwa-backend, waits for ServiceDown, then restarts and verifies /health.",
    expectedAlert: "ServiceDown",
    estimatedDurationMs: 3 * 60 * 1000,
    steps: [
      { type: "docker", action: "stop", container: "mwa-backend" },
      { type: "waitForPrometheus", query: 'up{job="mwa-backend"} == bool 0', threshold: 1, timeoutMs: 90_000 },
      { type: "waitForAlert", alertName: "ServiceDown", timeoutMs: 2 * 60 * 1000 },
      { type: "docker", action: "start", container: "mwa-backend" },
      { type: "waitForPrometheus", query: 'up{job="mwa-backend"}', threshold: 1, timeoutMs: 2 * 60 * 1000 },
      { type: "http", path: "/health", method: "GET", expectStatus: 200, timeoutMs: 30_000 },
    ],
  },
  {
    id: "host-high-cpu",
    name: "Host high CPU",
    description: "Runs CPU pressure workers until HighCPUUsage fires.",
    expectedAlert: "HighCPUUsage",
    estimatedDurationMs: CHAOS_DEFAULT_HOLD_MS + 2 * 60 * 1000,
    steps: [
      { type: "stress", mode: "cpu", workers: Number(process.env.CHAOS_CPU_WORKERS || 4), durationMs: CHAOS_DEFAULT_HOLD_MS },
      { type: "waitForPrometheus", query: '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)', threshold: 80, timeoutMs: 2 * 60 * 1000 },
      { type: "waitForAlert", alertName: "HighCPUUsage", timeoutMs: 2 * 60 * 1000 },
    ],
  },
  {
    id: "host-high-memory",
    name: "Host high memory",
    description: "Allocates bounded memory pressure until HighMemoryUsage fires, or blocks at the configured safety cap.",
    expectedAlert: "HighMemoryUsage",
    estimatedDurationMs: CHAOS_DEFAULT_HOLD_MS + 2 * 60 * 1000,
    steps: [
      { type: "stress", mode: "memory", bytes: CHAOS_MAX_MEMORY_BYTES, durationMs: CHAOS_DEFAULT_HOLD_MS },
      { type: "waitForPrometheus", query: "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100", threshold: 85, timeoutMs: 2 * 60 * 1000, blockOnTimeout: true },
      { type: "waitForAlert", alertName: "HighMemoryUsage", timeoutMs: 2 * 60 * 1000, blockOnTimeout: true },
    ],
  },
  {
    id: "db-connection-saturation",
    name: "DB connection saturation",
    description: "Holds DB sessions until saturation alerting rules can fire.",
    expectedAlert: "SaturationWarningSummary",
    estimatedDurationMs: CHAOS_LONG_HOLD_MS + 2 * 60 * 1000,
    steps: [
      { type: "db", action: "sleep-load", durationMs: CHAOS_LONG_HOLD_MS, connections: Number(process.env.CHAOS_DB_CONNECTIONS || 85), sleepSeconds: 30 },
      { type: "waitForPrometheus", query: "mwa:db_connections_used_ratio:5m", threshold: 0.8, timeoutMs: 2 * 60 * 1000 },
      { type: "waitForAlert", alertName: "SaturationWarningSummary", timeoutMs: 2 * 60 * 1000 },
    ],
  },
  {
    id: "db-deadlock",
    name: "DB deadlock probe",
    description: "Creates a controlled PostgreSQL deadlock and verifies the exporter counter increases.",
    expectedAlert: null,
    estimatedDurationMs: 90_000,
    steps: [
      { type: "db", action: "deadlock" },
      { type: "waitForPrometheus", query: 'sum(increase(pg_stat_database_deadlocks{datname="mwa"}[5m]))', threshold: 1, timeoutMs: 90_000 },
    ],
  },
  {
    id: "trace-content-validation",
    name: "Trace content validation",
    description: "Generates a failed request and verifies the trace exists in Tempo.",
    expectedAlert: null,
    estimatedDurationMs: 60_000,
    steps: [
      { type: "http", path: "/contract/error", method: "GET", expectStatus: 500, captureTrace: true },
      { type: "tempoTrace", statusCode: 500 },
    ],
  },
  {
    id: "trace-to-log-drilldown",
    name: "Trace to log drilldown",
    description: "Generates one traced request and verifies the same trace_id is searchable in Loki.",
    expectedAlert: null,
    estimatedDurationMs: 90_000,
    steps: [
      { type: "http", path: "/api/search?q=Notebook&page=1&limit=5", method: "GET", expectStatus: 200, requestId: "chaos-trace-log", captureTrace: true },
      { type: "tempoTrace", statusCode: 200 },
      { type: "lokiTraceLogs" },
    ],
  },
  {
    id: "metrics-collection-stop",
    name: "Metrics collection stop",
    description: "Temporarily disables /metrics through QA fault injection and verifies Prometheus marks backend DOWN.",
    expectedAlert: "ServiceDown",
    estimatedDurationMs: 3 * 60 * 1000,
    steps: [
      { type: "http", path: "/metrics", method: "GET", expectStatus: 503, headers: { "x-mwa-fault": "metrics-off", "x-mwa-fault-delay-ms": "120000" }, timeoutMs: 30_000 },
      { type: "waitForPrometheus", query: 'up{job="mwa-backend"} == bool 0', threshold: 1, timeoutMs: 90_000 },
      { type: "probeTelemetry", maximum: 0.9 },
    ],
  },
  {
    id: "promtail-pipeline-stop",
    name: "Promtail pipeline stop",
    description: "Stops promtail, generates backend logs, and verifies telemetry completeness drops.",
    expectedAlert: null,
    estimatedDurationMs: 2 * 60 * 1000,
    steps: [
      { type: "docker", action: "stop", container: "mwa-promtail" },
      { type: "load", path: "/api/search?q=Notebook&page=1&limit=5", method: "GET", durationMs: 30_000, concurrency: 2, intervalMs: 500, expectStatus: 200 },
      { type: "probeTelemetry", maximum: 0.9 },
      { type: "docker", action: "start", container: "mwa-promtail" },
    ],
  },
  {
    id: "tempo-pipeline-stop",
    name: "Tempo pipeline stop",
    description: "Stops Tempo, generates a traced request, and verifies trace lookup fails while other telemetry remains visible.",
    expectedAlert: null,
    estimatedDurationMs: 2 * 60 * 1000,
    steps: [
      { type: "docker", action: "stop", container: "mwa-tempo" },
      { type: "http", path: "/api/search?q=Notebook&page=1&limit=5", method: "GET", expectStatus: 200, requestId: "chaos-tempo-stop", captureTrace: true },
      { type: "tempoMissing" },
      { type: "probeTelemetry", maximum: 0.9 },
      { type: "docker", action: "start", container: "mwa-tempo" },
    ],
  },
  {
    id: "backend-disk-fill",
    name: "Backend disk fill",
    description: "Creates and removes a bounded temporary file in the backend container to validate disk panels.",
    expectedAlert: null,
    estimatedDurationMs: 2 * 60 * 1000,
    steps: [
      { type: "dockerExec", container: "mwa-backend", args: ["sh", "-c", `dd if=/dev/zero of=/tmp/mwa-chaos-disk-fill.bin bs=1M count=${Math.max(1, Math.floor(CHAOS_DISK_FILL_BYTES / 1024 / 1024))} conv=fsync`] },
      { type: "waitForPrometheus", query: 'max(100 * (1 - (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay|squashfs",mountpoint!~"/run.*|/var/lib/docker/.*"} / node_filesystem_size_bytes{fstype!~"tmpfs|overlay|squashfs",mountpoint!~"/run.*|/var/lib/docker/.*"})))', threshold: 1, timeoutMs: 90_000 },
      { type: "dockerExec", container: "mwa-backend", args: ["rm", "-f", "/tmp/mwa-chaos-disk-fill.bin"] },
    ],
  },
  {
    id: "backend-network-delay",
    name: "Backend network delay",
    description: "Applies tc netem delay to backend eth0 and verifies API p95 latency rises.",
    expectedAlert: "APIHighLatencyP95",
    estimatedDurationMs: 4 * 60 * 1000,
    steps: [
      { type: "dockerExec", container: "mwa-backend", args: ["tc", "qdisc", "replace", "dev", "eth0", "root", "netem", "delay", "200ms"] },
      { type: "load", path: "/api/search?q=Notebook&page=1&limit=5", method: "GET", durationMs: CHAOS_DEFAULT_HOLD_MS, concurrency: 4, intervalMs: 150, expectStatus: 200 },
      { type: "waitForPrometheus", query: "mwa:http_latency_p95_seconds:5m", threshold: 0.2, timeoutMs: 2 * 60 * 1000 },
      { type: "dockerExec", container: "mwa-backend", args: ["tc", "qdisc", "del", "dev", "eth0", "root"] },
    ],
  },
  {
    id: "log-before-kill",
    name: "Log before kill",
    description: "Emits a 5xx log, kills backend, restarts it, and verifies the pre-kill trace is searchable in Loki.",
    expectedAlert: "ServiceDown",
    estimatedDurationMs: 3 * 60 * 1000,
    steps: [
      { type: "http", path: "/contract/error", method: "GET", expectStatus: 500, requestId: "chaos-before-kill", captureTrace: true },
      { type: "docker", action: "kill", container: "mwa-backend" },
      { type: "docker", action: "start", container: "mwa-backend" },
      { type: "waitForPrometheus", query: 'up{job="mwa-backend"}', threshold: 1, timeoutMs: 2 * 60 * 1000 },
      { type: "lokiTraceLogs" },
    ],
  },
];

function appendLog(filePath, line) {
  const text = line.endsWith("\n") ? line : `${line}\n`;
  fs.appendFile(filePath, text, (err) => {
    if (err) console.error(`appendLog ${filePath}:`, err.message);
  });
}

function pickRandomProduct() {
  return PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
}

function escapeForInlineScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function isAllowedScenarioPath(pathname) {
  return ALLOWED_SCENARIO_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

function getValueAtPath(value, targetPath) {
  return targetPath.split(".").reduce((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (/^\d+$/.test(segment)) {
      const index = Number(segment);
      return Array.isArray(current) ? current[index] : undefined;
    }

    return current[segment];
  }, value);
}

function safePreview(value, limit = 320) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function getContextValue(source, targetPath) {
  return targetPath.split(".").reduce((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (/^\d+$/.test(segment)) {
      const index = Number(segment);
      return Array.isArray(current) ? current[index] : undefined;
    }

    return current[segment];
  }, source);
}

function resolveTemplateValue(value, context) {
  if (typeof value === "string") {
    const exactMatch = value.match(/^{{\s*([^}]+)\s*}}$/);
    if (exactMatch) {
      return getContextValue(context, exactMatch[1]);
    }

    return value.replace(/{{\s*([^}]+)\s*}}/g, (_match, token) => {
      const resolved = getContextValue(context, token);
      if (resolved === undefined || resolved === null) {
        throw new Error(`Unable to resolve template token: ${token}`);
      }
      return String(resolved);
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveTemplateValue(item, context));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, resolveTemplateValue(entryValue, context)]));
  }

  return value;
}

function validateAssertion(assertion, stepLabel, index) {
  if (typeof assertion !== "object" || assertion === null || Array.isArray(assertion)) {
    return `${stepLabel} assertion ${index + 1}: object여야 합니다.`;
  }

  if (assertion.type === "status") {
    return Number.isInteger(assertion.equals) ? null : `${stepLabel} assertion ${index + 1}: status.equals는 정수여야 합니다.`;
  }

  if (assertion.type === "json_path") {
    return typeof assertion.path === "string" && assertion.path.length > 0 && Object.prototype.hasOwnProperty.call(assertion, "equals")
      ? null
      : `${stepLabel} assertion ${index + 1}: json_path는 path와 equals가 필요합니다.`;
  }

  if (assertion.type === "text_includes" || assertion.type === "content_type_includes") {
    return typeof assertion.value === "string" && assertion.value.length > 0
      ? null
      : `${stepLabel} assertion ${index + 1}: ${assertion.type}.value는 비어 있지 않은 문자열이어야 합니다.`;
  }

  return `${stepLabel} assertion ${index + 1}: 지원하지 않는 assertion type 입니다.`;
}

function validateScenarioShape(scenario) {
  const errors = [];

  if (typeof scenario !== "object" || scenario === null || Array.isArray(scenario)) {
    return ["시나리오는 object여야 합니다."];
  }

  if (scenario.mode !== "sequential" && scenario.mode !== "parallel") {
    errors.push("mode는 sequential 또는 parallel 이어야 합니다.");
  }

  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    errors.push("steps는 1개 이상의 항목을 가진 배열이어야 합니다.");
    return errors;
  }

  scenario.steps.forEach((step, index) => {
    const stepLabel = `step ${index + 1}`;

    if (typeof step !== "object" || step === null || Array.isArray(step)) {
      errors.push(`${stepLabel}: object여야 합니다.`);
      return;
    }

    const method = step.method ?? "GET";
    if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) {
      errors.push(`${stepLabel}: method는 GET, POST, PATCH, DELETE만 허용됩니다.`);
    }

    if (typeof step.path !== "string" || step.path.length === 0) {
      errors.push(`${stepLabel}: path는 비어 있지 않은 문자열이어야 합니다.`);
    } else {
      const normalizedValidationPath = step.path.replace(/{{\s*[^}]+\s*}}/g, "placeholder");
      if (!isAllowedScenarioPath(normalizedValidationPath)) {
        errors.push(`${stepLabel}: 허용되지 않은 path 입니다 (${step.path}).`);
      }
    }

    if (step.timeoutMs !== undefined && (!Number.isInteger(step.timeoutMs) || step.timeoutMs <= 0 || step.timeoutMs > 30000)) {
      errors.push(`${stepLabel}: timeoutMs는 1~30000 사이 정수여야 합니다.`);
    }

    if (step.headers !== undefined) {
      if (typeof step.headers !== "object" || step.headers === null || Array.isArray(step.headers)) {
        errors.push(`${stepLabel}: headers는 object여야 합니다.`);
      } else {
        for (const [headerName, headerValue] of Object.entries(step.headers)) {
          if (typeof headerValue !== "string") {
            errors.push(`${stepLabel}: header ${headerName} 값은 문자열이어야 합니다.`);
          }
        }
      }
    }

    if (step.body !== undefined && (typeof step.body !== "object" || step.body === null || Array.isArray(step.body))) {
      errors.push(`${stepLabel}: body는 object여야 합니다.`);
    }

    if (step.assertions !== undefined) {
      if (!Array.isArray(step.assertions)) {
        errors.push(`${stepLabel}: assertions는 배열이어야 합니다.`);
      } else {
        step.assertions.forEach((assertion, assertionIndex) => {
          const assertionError = validateAssertion(assertion, stepLabel, assertionIndex);
          if (assertionError !== null) {
            errors.push(assertionError);
          }
        });
      }
    }
  });

  return errors;
}

function getScenarioTemplateById(scenarioId) {
  return SCENARIO_TEMPLATES.find((scenario) => scenario.id === scenarioId) || null;
}

function getScenarioGroup(scenario) {
  return String(scenario?.id || "").startsWith("buyer-") ? "buyer" : `scenario:${scenario.id}`;
}

function getScenarioPublicSummary(scenario) {
  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    mode: scenario.mode,
    stepCount: Array.isArray(scenario.steps) ? scenario.steps.length : 0,
    group: getScenarioGroup(scenario),
  };
}

function firstExistingPath(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

async function getK6ScenarioCatalog() {
  const catalogPath = firstExistingPath(K6_SCENARIO_CATALOG_PATHS);
  if (catalogPath === null) {
    return {
      source: null,
      packs: ["smoke", "contract", "buyer", "fault", "validation", "all"],
      scenarios: [],
      error: "k6 scenario catalog file was not found.",
    };
  }

  try {
    const moduleUrl = `${pathToFileURL(catalogPath).href}?mtime=${fs.statSync(catalogPath).mtimeMs}`;
    const catalogModule = await import(moduleUrl);
    const scenarios = Array.isArray(catalogModule.k6Scenarios) ? catalogModule.k6Scenarios : [];
    const packs = Array.isArray(catalogModule.k6Packs) ? catalogModule.k6Packs : ["smoke", "contract", "buyer", "fault", "validation", "all"];
    return {
      source: catalogPath,
      packs,
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id,
        name: scenario.name || scenario.id,
        description: scenario.description || "",
        pack: scenario.pack || "uncategorized",
        tags: Array.isArray(scenario.tags) ? scenario.tags : [],
        destructive: scenario.destructive === true,
      })),
      error: null,
    };
  } catch (error) {
    return {
      source: catalogPath,
      packs: ["smoke", "contract", "buyer", "fault", "validation", "all"],
      scenarios: [],
      error: error instanceof Error ? error.message : "Unable to load k6 scenario catalog.",
    };
  }
}

function getLatestK6Summary() {
  const summaryPath = firstExistingPath(K6_SUMMARY_PATHS);
  if (summaryPath === null) {
    return {
      found: false,
      source: null,
      summary: null,
    };
  }

  try {
    return {
      found: true,
      source: summaryPath,
      summary: JSON.parse(fs.readFileSync(summaryPath, "utf8")),
    };
  } catch (error) {
    return {
      found: false,
      source: summaryPath,
      summary: null,
      error: error instanceof Error ? error.message : "Unable to read k6 summary.",
    };
  }
}

function getK6RunCommand({ scenarioIds = [], pack = K6_SCENARIO_PACK_DEFAULT } = {}) {
  const selectedScenarioIds = Array.isArray(scenarioIds)
    ? scenarioIds.map((scenarioId) => String(scenarioId)).filter(Boolean)
    : [];
  if (selectedScenarioIds.length > 0) {
    return `npm run monitoring:scenario:k6 -- --scenario ${selectedScenarioIds.join(",")}`;
  }
  return `npm run monitoring:scenario:k6 -- --pack ${pack || K6_SCENARIO_PACK_DEFAULT}`;
}

function evaluateAssertion(assertion, result) {
  if (assertion.type === "status") {
    const actual = result.status;
    return {
      label: `status === ${assertion.equals}`,
      passed: actual === assertion.equals,
      expected: assertion.equals,
      actual,
    };
  }

  if (assertion.type === "json_path") {
    const actual = result.bodyKind === "json" ? getValueAtPath(result.body, assertion.path) : undefined;
    return {
      label: `json ${assertion.path} === ${JSON.stringify(assertion.equals)}`,
      passed: JSON.stringify(actual) === JSON.stringify(assertion.equals),
      expected: assertion.equals,
      actual,
    };
  }

  if (assertion.type === "text_includes") {
    const actual = typeof result.textBody === "string" && result.textBody.includes(assertion.value);
    return {
      label: `text includes ${assertion.value}`,
      passed: actual,
      expected: assertion.value,
      actual: result.textBody,
    };
  }

  if (assertion.type === "content_type_includes") {
    const actual = result.contentType || "";
    return {
      label: `content-type includes ${assertion.value}`,
      passed: actual.includes(assertion.value),
      expected: assertion.value,
      actual,
    };
  }

  return {
    label: assertion.type,
    passed: false,
    expected: "supported assertion",
    actual: "unsupported assertion",
  };
}

async function executeScenarioStep(step, context) {
  const startedAt = Date.now();

  try {
    const resolvedPath = resolveTemplateValue(step.path, context);
    if (typeof resolvedPath !== "string") {
      throw new Error("Resolved path must be a string");
    }

    const resolvedMethod = resolveTemplateValue(step.method ?? "GET", context);
    if (typeof resolvedMethod !== "string") {
      throw new Error("Resolved method must be a string");
    }

    const resolvedHeaders = step.headers === undefined ? {} : resolveTemplateValue(step.headers, context);
    const resolvedBody = step.body === undefined ? undefined : resolveTemplateValue(step.body, context);
    const stepUrl = new URL(resolvedPath, `${SCENARIO_BACKEND_BASE_URL}/`).toString();
    const requestHeaders = {
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
      ...resolvedHeaders,
    };
    const bodyPayload = resolvedBody === undefined ? undefined : JSON.stringify(resolvedBody);

    if (bodyPayload !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
    }

    const response = await fetch(stepUrl, {
      method: resolvedMethod,
      headers: requestHeaders,
      body: bodyPayload,
      signal: AbortSignal.timeout(step.timeoutMs ?? 8000),
    });

    const durationMs = Date.now() - startedAt;
    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();
    const isJson = contentType.includes("application/json");
    const body = isJson ? JSON.parse(rawText) : rawText;
      const baseResult = {
      id: step.id || step.label || step.path,
      label: step.label || step.path,
      method: resolvedMethod,
      path: resolvedPath,
      targetUrl: stepUrl,
      status: response.status,
      ok: response.ok,
      durationMs,
      contentType,
      requestHeaders: resolvedHeaders,
      requestBody: resolvedBody ?? null,
      bodyKind: isJson ? "json" : "text",
      body,
      textBody: rawText,
      preview: safePreview(body),
    };
    const assertionResults = (step.assertions || []).map((assertion) => evaluateAssertion(assertion, baseResult));
    const passed = assertionResults.every((assertion) => assertion.passed);

    return {
      ...baseResult,
      passed,
      assertions: assertionResults,
      error: null,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    return {
      id: step.id || step.label || step.path,
      label: step.label || step.path,
      method: step.method ?? "GET",
      path: step.path,
      targetUrl: null,
      status: null,
      ok: false,
      durationMs,
      contentType: null,
      requestHeaders: step.headers ?? {},
      requestBody: step.body ?? null,
      bodyKind: "error",
      body: null,
      textBody: null,
      preview: error instanceof Error ? error.message : "Unknown execution error",
      passed: false,
      assertions: [],
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}

async function executeScenario(scenario) {
  const mode = scenario.mode;
  const steps = scenario.steps;
  const runId = crypto.randomUUID();
  const context = {
    runtime: {
      runId,
    },
    steps: {},
  };
  const results = mode === "parallel"
    ? await Promise.all(steps.map((step) => executeScenarioStep(step, context)))
    : await steps.reduce(async (promise, step) => {
      const collected = await promise;
      const nextResult = await executeScenarioStep(step, context);
      if (step.id !== undefined) {
        context.steps[step.id] = nextResult;
      }
      return [...collected, nextResult];
    }, Promise.resolve([]));

  if (mode === "parallel") {
    steps.forEach((step, index) => {
      if (step.id !== undefined) {
        context.steps[step.id] = results[index];
      }
    });
  }

  const passedSteps = results.filter((result) => result.passed).length;
  const failedSteps = results.length - passedSteps;

  return {
    runId,
    scenarioName: scenario.name || "Custom scenario",
    mode,
    backendBaseUrl: SCENARIO_BACKEND_BASE_URL,
    startedAt: new Date().toISOString(),
    summary: {
      totalSteps: results.length,
      passedSteps,
      failedSteps,
      passed: failedSteps === 0,
    },
    results,
  };
}

function summarizeScenarioRun(scenario, run, startedAtMs) {
  const failedSteps = run.results.filter((result) => !result.passed).map((result) => ({
    id: result.id,
    label: result.label,
    method: result.method,
    path: result.path,
    status: result.status,
    durationMs: result.durationMs,
    preview: result.preview,
    error: result.error,
    assertions: result.assertions.filter((assertion) => !assertion.passed),
  }));

  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    description: scenario.description,
    mode: run.mode,
    status: run.summary.passed ? "pass" : "fail",
    durationMs: Date.now() - startedAtMs,
    totalSteps: run.summary.totalSteps,
    passedSteps: run.summary.passedSteps,
    failedSteps: run.summary.failedSteps,
    runId: run.runId,
    failures: failedSteps,
  };
}

async function executeScenarioForBatch(scenario) {
  const startedAtMs = Date.now();
  if (getScenarioGroup(scenario) === "buyer") {
    await resetBackendSeedForScenarioCycle();
  }
  const run = await executeScenario(scenario);
  await updateMonitoringKpis(scenario, run);
  return summarizeScenarioRun(scenario, run, startedAtMs);
}

async function executeScenarioGroup(groupScenarios) {
  const results = [];

  for (const scenario of groupScenarios) {
    results.push(await executeScenarioForBatch(scenario));
  }

  return results;
}

async function executeScenarioBatch(scenarios) {
  const batchRunId = crypto.randomUUID();
  await resetBackendSeedForScenarioCycle();
  const indexedScenarios = scenarios.map((scenario, index) => ({ scenario, index }));
  const groups = new Map();

  indexedScenarios.forEach((entry) => {
    const group = getScenarioGroup(entry.scenario);
    groups.set(group, [...(groups.get(group) || []), entry]);
  });

  const groupedResults = await Promise.all([...groups.values()].map(async (entries) => {
    const scenarioResults = await executeScenarioGroup(entries.map((entry) => entry.scenario));
    return scenarioResults.map((result, index) => ({
      result,
      index: entries[index].index,
    }));
  }));

  const results = groupedResults
    .flat()
    .sort((left, right) => left.index - right.index)
    .map(({ result }) => result);
  const passedScenarios = results.filter((result) => result.status === "pass").length;
  const failedScenarios = results.length - passedScenarios;

  return {
    success: true,
    runId: batchRunId,
    summary: {
      totalScenarios: results.length,
      passedScenarios,
      failedScenarios,
      passed: failedScenarios === 0,
    },
    results,
  };
}

function clampRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

function getScenarioStepPaths(scenario) {
  return Array.isArray(scenario?.steps)
    ? scenario.steps
      .map((step) => (typeof step?.path === "string" ? step.path : null))
      .filter((stepPath) => stepPath !== null)
    : [];
}

function getExpectedAlertNames(scenario, run) {
  const alertNames = new Set();
  const scenarioText = JSON.stringify({
    name: scenario?.name,
    steps: getScenarioStepPaths(scenario),
  }).toLowerCase();

  if (scenarioText.includes("payment")) {
    KPI_ALERT_RULES.payment.forEach((alertName) => {
      alertNames.add(alertName);
    });
  }

  if (scenarioText.includes("/api/orders") || scenarioText.includes("order")) {
    KPI_ALERT_RULES.order.forEach((alertName) => {
      alertNames.add(alertName);
    });
  }

  if (
    scenarioText.includes("search")
    || scenarioText.includes("catalog")
    || scenarioText.includes("health")
    || scenarioText.includes("metrics")
    || scenarioText.includes("route-that-does-not-exist")
  ) {
    KPI_ALERT_RULES.api.forEach((alertName) => {
      alertNames.add(alertName);
    });
  }

  if (run?.summary?.passed === false && alertNames.size === 0) {
    KPI_ALERT_RULES.api.forEach((alertName) => {
      alertNames.add(alertName);
    });
  }

  return [...alertNames];
}

async function safeFetchText(url) {
  try {
    const response = await fetch(url);
    return {
      ok: response.ok,
      body: await response.text(),
    };
  } catch (error) {
    return {
      ok: false,
      body: error instanceof Error ? error.message : "Unknown fetch failure",
    };
  }
}

async function safeFetchJson(url) {
  try {
    const response = await fetch(url);
    return {
      ok: response.ok,
      body: await response.json(),
    };
  } catch (error) {
    return {
      ok: false,
      body: null,
      error: error instanceof Error ? error.message : "Unknown fetch failure",
    };
  }
}

function extractVectorMax(payload) {
  const result = Array.isArray(payload?.data?.result) ? payload.data.result : [];
  const values = result
    .map((entry) => Number(entry?.value?.[1]))
    .filter((value) => Number.isFinite(value));
  return values.length === 0 ? 0 : Math.max(...values);
}

function resolveChaosValue(value, run) {
  if (typeof value === "string") {
    return value
      .replace(/{{\s*run\.id\s*}}/g, run.id)
      .replace(/{{\s*trace_id\s*}}/g, run.context.traceId || "");
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveChaosValue(item, run));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entryValue]) => [key, resolveChaosValue(entryValue, run)]));
  }

  return value;
}

async function resetBackendSeedForScenarioCycle() {
  if (!SCENARIO_RESET_SEED_ENABLED) {
    return;
  }

  const response = await fetch(`${SCENARIO_BACKEND_BASE_URL}/contract/qa/reset-seed`, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Unable to reset backend seed before QA cycle (${response.status}): ${safePreview(body, 180)}`);
  }
}

const chaosRuns = new Map();
const chaosBatches = new Map();
const chaosQueue = [];
let activeChaosRunId = null;
let latestChaosTraceId = "";

function getChaosPublicScenarios() {
  return CHAOS_SCENARIOS.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    expectedAlert: scenario.expectedAlert,
    stepCount: scenario.steps.length,
    estimatedDurationMs: scenario.estimatedDurationMs,
  }));
}

function trimChaosRuns() {
  const cutoff = Date.now() - CHAOS_RUN_RETENTION_MS;
  for (const [runId, run] of chaosRuns.entries()) {
    if (run.finishedAtMs !== null && run.finishedAtMs < cutoff) {
      chaosRuns.delete(runId);
    }
  }
  for (const [batchId, batch] of chaosBatches.entries()) {
    if (batch.createdAtMs < cutoff && batch.runIds.every((runId) => !chaosRuns.has(runId))) {
      chaosBatches.delete(batchId);
    }
  }
}

function findChaosScenario(scenarioId) {
  return CHAOS_SCENARIOS.find((scenario) => scenario.id === scenarioId) || null;
}

function nowIso() {
  return new Date().toISOString();
}

function formatChaosRun(run) {
  return {
    id: run.id,
    batchId: run.batchId,
    scenarioId: run.scenario.id,
    scenarioName: run.scenario.name,
    description: run.scenario.description,
    expectedAlert: run.scenario.expectedAlert,
    status: run.status,
    phase: run.phase,
    queuedAt: run.queuedAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: (run.finishedAtMs || Date.now()) - (run.startedAtMs || run.queuedAtMs),
    enabled: QA_CHAOS_ENABLED,
    progress: {
      completedSteps: run.completedSteps,
      totalSteps: run.scenario.steps.length,
    },
    steps: run.steps,
    observations: run.observations,
    error: run.error,
    blockedReason: run.blockedReason,
  };
}

function getChaosRunSummary(runs) {
  const counts = {
    total: runs.length,
    queued: 0,
    running: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    cancelled: 0,
  };

  runs.forEach((run) => {
    if (run.status === "queued") counts.queued += 1;
    else if (run.status === "running") counts.running += 1;
    else if (run.status === "pass") counts.passed += 1;
    else if (run.status === "fail") counts.failed += 1;
    else if (run.status === "blocked_by_safety_cap") counts.blocked += 1;
    else if (run.status === "cancelled") counts.cancelled += 1;
  });

  return {
    ...counts,
    completed: counts.passed + counts.failed + counts.blocked + counts.cancelled,
    activeRunId: activeChaosRunId,
    queueDepth: chaosQueue.length,
  };
}

function formatChaosBatch(batch) {
  const runs = batch.runIds.map((runId) => chaosRuns.get(runId)).filter(Boolean);
  return {
    id: batch.id,
    createdAt: batch.createdAt,
    runIds: batch.runIds,
    scenarioIds: batch.scenarioIds,
    estimatedDurationMs: batch.estimatedDurationMs,
    summary: getChaosRunSummary(runs),
    runs: runs.map(formatChaosRun),
  };
}

function getAllChaosRuns() {
  return [...chaosRuns.values()].sort((left, right) => left.queuedAtMs - right.queuedAtMs);
}

function setChaosRunPhase(run, phase) {
  run.phase = phase;
  run.observations.push({ ts: nowIso(), phase });
}

function finishChaosRun(run, status, error = null, options = {}) {
  if (run.finishedAtMs !== null) {
    return;
  }

  run.status = status;
  run.error = error;
  run.finishedAtMs = Date.now();
  run.finishedAt = nowIso();
  run.phase = status;
  if (status === "blocked_by_safety_cap") {
    chaosRunsTotal.inc({ result: "blocked" });
  } else {
    chaosRunsTotal.inc({ result: status === "pass" ? "success" : "failure" });
  }
  releaseChaosResources(run);
  if (activeChaosRunId === run.id) {
    activeChaosRunId = null;
  }
  updateChaosQueueMetrics();
  if (options.startNext !== false) {
    startNextChaosRun();
  }
}

function updateChaosQueueMetrics() {
  chaosQueueBacklog.set(chaosQueue.length);
  const oldestQueuedAtMs = chaosQueue
    .map((runId) => chaosRuns.get(runId)?.queuedAtMs)
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => left - right)[0];
  chaosQueueOldestAgeSeconds.set(oldestQueuedAtMs === undefined ? 0 : (Date.now() - oldestQueuedAtMs) / 1000);
  chaosActiveWorkers.set(activeChaosRunId === null ? 0 : 1);
}

function execFileText(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: options.timeout ?? 60_000, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function assertChaosEnabled() {
  if (!QA_CHAOS_ENABLED) {
    const error = new Error("QA chaos runner is disabled. Start with monitoring/docker-compose.chaos.yml and QA_CHAOS_ENABLED=true.");
    error.statusCode = 403;
    throw error;
  }
}

function assertAllowedContainer(container) {
  if (!CHAOS_ALLOWED_CONTAINERS.has(container)) {
    throw new Error(`Container is not allowed for chaos control: ${container}`);
  }
}

function getDatabaseUrl() {
  return process.env.DATABASE_URL || "postgresql://mwa:mwa@postgres:5432/mwa?schema=public";
}

function spawnTracked(run, command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: options.stdio || "ignore",
    env: options.env || process.env,
  });
  run.children.add(child);
  child.once("exit", () => {
    run.children.delete(child);
  });
  child.once("error", (error) => {
    run.observations.push({ ts: nowIso(), phase: "child_error", command, message: error.message });
  });
  return child;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Chaos run was cancelled"));
      return;
    }
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new Error("Chaos run was cancelled"));
    }, { once: true });
  });
}

async function fetchWithTimeout(url, options = {}) {
  const signal = options.signal || AbortSignal.timeout(options.timeoutMs || 30_000);
  return fetch(url, { ...options, signal });
}

async function executeChaosHttpStep(run, step) {
  const body = step.body === undefined ? undefined : JSON.stringify(resolveChaosValue(step.body, run));
  const headers = {
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    "x-request-id": step.requestId ? `${step.requestId}-${run.id}` : `chaos-${run.id}`,
    ...resolveChaosValue(step.headers || {}, run),
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetchWithTimeout(new URL(step.path, `${SCENARIO_BACKEND_BASE_URL}/`).toString(), {
    method: step.method || "GET",
    headers,
    body,
    timeoutMs: step.timeoutMs || 30_000,
  });
  const traceId = response.headers.get("x-trace-id") || "";
  if (traceId.length > 0) {
    latestChaosTraceId = traceId;
    run.context.traceId = traceId;
  }
  const text = await response.text();
  const ok = response.status === step.expectStatus;
  return {
    ok,
    status: response.status,
    traceId,
    preview: safePreview(text, 240),
  };
}

async function executeChaosLoadStep(run, step) {
  const endAt = Date.now() + step.durationMs;
  let requests = 0;
  let expectedStatuses = 0;
  const workers = Array.from({ length: step.concurrency }, async () => {
    while (Date.now() < endAt && !run.abortController.signal.aborted) {
      try {
        const result = await executeChaosHttpStep(run, {
          path: step.path,
          method: step.method,
          expectStatus: step.expectStatus,
          headers: step.headers,
          body: step.body,
          requestId: step.requestId,
          timeoutMs: 30_000,
        });
        requests += 1;
        if (result.status === step.expectStatus) {
          expectedStatuses += 1;
        }
      } catch (error) {
        requests += 1;
        run.observations.push({ ts: nowIso(), phase: "load_request_error", message: error.message });
      }
      await sleep(step.intervalMs, run.abortController.signal);
    }
  });
  await Promise.all(workers);
  return {
    ok: expectedStatuses > 0,
    requests,
    expectedStatuses,
    durationMs: step.durationMs,
  };
}

async function executeChaosDockerStep(_run, step) {
  assertAllowedContainer(step.container);
  try {
    await execFileText("docker", [step.action, step.container], { timeout: 60_000 });
  } catch (error) {
    const stderr = String(error.stderr || error.message || "");
    if (step.action !== "start" || !stderr.includes("is already running")) {
      throw error;
    }
  }
  return { ok: true, action: step.action, container: step.container };
}

async function executeChaosDockerExecStep(_run, step) {
  assertAllowedContainer(step.container);
  if (!Array.isArray(step.args) || step.args.length === 0) {
    throw new Error("dockerExec requires args");
  }

  await execFileText("docker", ["exec", step.container, ...step.args], { timeout: step.timeoutMs || 60_000 });
  return { ok: true, container: step.container, args: step.args };
}

function executeChaosStressStep(run, step) {
  if (step.mode === "memory" && step.bytes > CHAOS_MAX_MEMORY_BYTES) {
    run.blockedReason = `Requested ${step.bytes} bytes exceeds CHAOS_MAX_MEMORY_BYTES=${CHAOS_MAX_MEMORY_BYTES}`;
    return { ok: false, blocked: true, message: run.blockedReason };
  }

  const script = step.mode === "cpu"
    ? "const end=Date.now()+Number(process.env.CHAOS_DURATION_MS);while(Date.now()<end){Math.sqrt(Math.random()*Number.MAX_SAFE_INTEGER)}"
    : "const chunks=[];const target=Number(process.env.CHAOS_MEMORY_BYTES);let allocated=0;while(allocated<target){const size=Math.min(1048576,target-allocated);chunks.push(Buffer.alloc(size,1));allocated+=size}setTimeout(()=>{},Number(process.env.CHAOS_DURATION_MS));";
  const workers = step.mode === "cpu" ? Math.max(1, step.workers || 1) : 1;
  for (let index = 0; index < workers; index += 1) {
    spawnTracked(run, process.execPath, ["-e", script], {
      env: {
        ...process.env,
        CHAOS_DURATION_MS: String(step.durationMs),
        CHAOS_MEMORY_BYTES: String(step.bytes || 0),
      },
    });
  }
  return { ok: true, mode: step.mode, workers, durationMs: step.durationMs, bytes: step.bytes || 0 };
}

async function prepareDeadlockTable() {
  await execFileText("psql", [
    getDatabaseUrl(),
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "CREATE TABLE IF NOT EXISTS qa_deadlock_probe (id INT PRIMARY KEY, value INT NOT NULL DEFAULT 0); INSERT INTO qa_deadlock_probe(id, value) VALUES (1, 0), (2, 0) ON CONFLICT (id) DO NOTHING;",
  ], { timeout: 30_000 });
}

async function executeChaosDbStep(run, step) {
  if (step.action === "sleep-load") {
    const sleepSeconds = Math.max(1, step.sleepSeconds || 30);
    const deadline = Date.now() + step.durationMs;
    const loopScript = [
      "const { spawnSync } = require('child_process');",
      "const deadline = Date.now() + Number(process.env.CHAOS_DURATION_MS);",
      "while (Date.now() < deadline) {",
      "  spawnSync('psql', [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', `SELECT pg_sleep(${process.env.CHAOS_SLEEP_SECONDS})`], { stdio: 'ignore' });",
      "}",
    ].join("");
    for (let index = 0; index < step.connections; index += 1) {
      spawnTracked(run, process.execPath, ["-e", loopScript], {
        env: {
          ...process.env,
          DATABASE_URL: getDatabaseUrl(),
          CHAOS_DURATION_MS: String(step.durationMs),
          CHAOS_SLEEP_SECONDS: String(sleepSeconds),
        },
      });
    }
    return { ok: true, action: step.action, connections: step.connections, durationMs: step.durationMs };
  }

  if (step.action === "deadlock") {
    await prepareDeadlockTable();
    const left = execFileText("psql", [
      getDatabaseUrl(),
      "-v",
      "ON_ERROR_STOP=0",
      "-c",
      "BEGIN; UPDATE qa_deadlock_probe SET value = value + 1 WHERE id = 1; SELECT pg_sleep(2); UPDATE qa_deadlock_probe SET value = value + 1 WHERE id = 2; COMMIT;",
    ], { timeout: 30_000 }).catch((error) => ({ error }));
    const right = execFileText("psql", [
      getDatabaseUrl(),
      "-v",
      "ON_ERROR_STOP=0",
      "-c",
      "BEGIN; UPDATE qa_deadlock_probe SET value = value + 1 WHERE id = 2; SELECT pg_sleep(2); UPDATE qa_deadlock_probe SET value = value + 1 WHERE id = 1; COMMIT;",
    ], { timeout: 30_000 }).catch((error) => ({ error }));
    const results = await Promise.all([left, right]);
    const deadlockSeen = results.some((result) => String(result?.stderr || result?.error?.stderr || result?.error?.message || "").toLowerCase().includes("deadlock"));
    return { ok: deadlockSeen, action: step.action, deadlockSeen };
  }

  throw new Error(`Unsupported db chaos action: ${step.action}`);
}

function extractPrometheusScalar(payload) {
  return extractVectorMax(payload);
}

async function queryPrometheusValue(query) {
  const response = await safeFetchJson(`${MONITORING_PROMETHEUS_BASE_URL}/api/v1/query?query=${encodeURIComponent(query)}`);
  if (!response.ok) {
    return { ok: false, value: 0, payload: response.body };
  }
  return { ok: true, value: extractPrometheusScalar(response.body), payload: response.body };
}

async function executeChaosWaitForPrometheusStep(run, step) {
  const deadline = Date.now() + step.timeoutMs;
  let lastValue = 0;
  while (Date.now() < deadline && !run.abortController.signal.aborted) {
    const result = await queryPrometheusValue(step.query);
    lastValue = result.value;
    run.observations.push({ ts: nowIso(), phase: "prometheus_poll", query: step.query, value: lastValue, threshold: step.threshold });
    if (result.ok && lastValue >= step.threshold) {
      return { ok: true, query: step.query, value: lastValue, threshold: step.threshold };
    }
    await sleep(CHAOS_POLL_INTERVAL_MS, run.abortController.signal);
  }
  if (step.blockOnTimeout) {
    run.blockedReason = `Prometheus query did not reach threshold before safety timeout: ${step.query} last=${lastValue}`;
    return { ok: false, blocked: true, query: step.query, value: lastValue, threshold: step.threshold };
  }
  return { ok: false, query: step.query, value: lastValue, threshold: step.threshold };
}

async function executeChaosWaitForAlertStep(run, step) {
  const query = `ALERTS{alertname="${step.alertName}",alertstate="firing"}`;
  return executeChaosWaitForPrometheusStep(run, {
    query,
    threshold: 1,
    timeoutMs: step.timeoutMs,
    blockOnTimeout: step.blockOnTimeout,
  });
}

function tracePayloadContains(payload, needle) {
  return JSON.stringify(payload || {}).includes(needle);
}

async function executeChaosTempoTraceStep(run, step) {
  const traceId = run.context.traceId || latestChaosTraceId;
  if (!traceId) {
    return { ok: false, message: "No captured x-trace-id is available" };
  }
  const response = await safeFetchJson(`${MONITORING_GRAFANA_BASE_URL}/api/datasources/proxy/uid/tempo/api/traces/${encodeURIComponent(traceId)}`);
  const directResponse = response.ok
    ? response
    : await safeFetchJson(`${process.env.MONITORING_TEMPO_BASE_URL || "http://tempo:3200"}/api/traces/${encodeURIComponent(traceId)}`);
  const payloadText = JSON.stringify(directResponse.body || {});
  const ok = directResponse.ok
    && tracePayloadContains(directResponse.body, "mwa-backend")
    && (step.statusCode === undefined || payloadText.includes(String(step.statusCode)));
  return { ok, traceId, statusCode: step.statusCode, sourceOk: directResponse.ok };
}

async function executeChaosTempoMissingStep(run) {
  const traceId = run.context.traceId || latestChaosTraceId;
  if (!traceId) {
    return { ok: false, message: "No captured x-trace-id is available" };
  }

  const response = await safeFetchJson(`${process.env.MONITORING_TEMPO_BASE_URL || "http://tempo:3200"}/api/traces/${encodeURIComponent(traceId)}`);
  return { ok: !response.ok, traceId, sourceOk: response.ok };
}

async function executeChaosLokiTraceLogsStep(run) {
  const traceId = run.context.traceId || latestChaosTraceId;
  if (!traceId) {
    return { ok: false, message: "No captured x-trace-id is available" };
  }

  const query = `{service_name="mwa-backend"} | json | trace_id="${traceId}"`;
  const response = await safeFetchJson(`${MONITORING_LOKI_BASE_URL}/loki/api/v1/query?query=${encodeURIComponent(query)}`);
  const resultCount = Array.isArray(response.body?.data?.result) ? response.body.data.result.length : 0;
  return { ok: response.ok && resultCount > 0, traceId, resultCount };
}

async function executeChaosProbeTelemetryStep(_run, step) {
  currentTelemetryCompletenessRatio = await probeTelemetryCompleteness();
  labelCoverageRatio.set(await probeLabelCoverage());
  updateKpiGauges();
  const minimum = Number.isFinite(step.minimum) ? step.minimum : undefined;
  const maximum = Number.isFinite(step.maximum) ? step.maximum : undefined;
  const ok = (minimum === undefined || currentTelemetryCompletenessRatio >= minimum)
    && (maximum === undefined || currentTelemetryCompletenessRatio <= maximum);
  return { ok, value: currentTelemetryCompletenessRatio, minimum, maximum };
}

async function executeChaosStep(run, step, index) {
  const startedAtMs = Date.now();
  const stepResult = {
    index,
    type: step.type,
    label: `${index + 1}. ${step.type}`,
    status: "running",
    startedAt: nowIso(),
    finishedAt: null,
    durationMs: 0,
    details: null,
  };
  run.steps.push(stepResult);
  setChaosRunPhase(run, stepResult.label);

  try {
    let details;
    if (step.type === "http") details = await executeChaosHttpStep(run, step);
    else if (step.type === "load") details = await executeChaosLoadStep(run, step);
    else if (step.type === "docker") details = await executeChaosDockerStep(run, step);
    else if (step.type === "dockerExec") details = await executeChaosDockerExecStep(run, step);
    else if (step.type === "stress") details = executeChaosStressStep(run, step);
    else if (step.type === "db") details = await executeChaosDbStep(run, step);
    else if (step.type === "waitForPrometheus") details = await executeChaosWaitForPrometheusStep(run, step);
    else if (step.type === "waitForAlert") details = await executeChaosWaitForAlertStep(run, step);
    else if (step.type === "tempoTrace") details = await executeChaosTempoTraceStep(run, step);
    else if (step.type === "tempoMissing") details = await executeChaosTempoMissingStep(run, step);
    else if (step.type === "lokiTraceLogs") details = await executeChaosLokiTraceLogsStep(run, step);
    else if (step.type === "probeTelemetry") details = await executeChaosProbeTelemetryStep(run, step);
    else throw new Error(`Unsupported chaos step type: ${step.type}`);

    stepResult.details = details;
    stepResult.status = details.blocked ? "blocked" : details.ok ? "pass" : "fail";
    if (details.blocked) {
      run.status = "blocked_by_safety_cap";
    }
  } catch (error) {
    stepResult.status = run.abortController.signal.aborted ? "cancelled" : "fail";
    stepResult.details = { ok: false, message: error instanceof Error ? error.message : "Chaos step failed" };
  } finally {
    stepResult.finishedAt = nowIso();
    stepResult.durationMs = Date.now() - startedAtMs;
    run.completedSteps += 1;
  }

  return stepResult;
}

function releaseChaosResources(run) {
  for (const child of run.children) {
    if (!child.killed) {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 3000);
    }
  }
  run.children.clear();
}

async function recoverChaosTargets(run = null) {
  const startedAtMs = Date.now();
  const recoveryStep = run
    ? {
      index: run.steps.length,
      type: "recovery",
      label: `${run.steps.length + 1}. recovery`,
      status: "running",
      startedAt: nowIso(),
      finishedAt: null,
      durationMs: 0,
      details: null,
    }
    : null;
  if (recoveryStep) {
    run.steps.push(recoveryStep);
  }
  const recovery = [];
  for (const container of ["mwa-backend", "mwa-promtail", "mwa-tempo"]) {
    try {
      await executeChaosDockerStep(null, { action: "start", container });
      recovery.push({ target: container, action: "start", ok: true });
    } catch (error) {
      recovery.push({ target: container, action: "start", ok: false, message: error.message });
    }
  }
  try {
    await executeChaosDockerExecStep(null, { container: "mwa-backend", args: ["tc", "qdisc", "del", "dev", "eth0", "root"], timeoutMs: 30_000 });
    recovery.push({ target: "mwa-backend", action: "netem-cleanup", ok: true });
  } catch (error) {
    recovery.push({ target: "mwa-backend", action: "netem-cleanup", ok: true, message: "no qdisc to clean" });
  }
  try {
    await executeChaosDockerExecStep(null, { container: "mwa-backend", args: ["rm", "-f", "/tmp/mwa-chaos-disk-fill.bin"], timeoutMs: 30_000 });
    recovery.push({ target: "mwa-backend", action: "disk-cleanup", ok: true });
  } catch (error) {
    recovery.push({ target: "mwa-backend", action: "disk-cleanup", ok: false, message: error.message });
  }
  if (run) {
    releaseChaosResources(run);
    run.observations.push({ ts: nowIso(), phase: "recovery", recovery });
  }
  if (recoveryStep) {
    recoveryStep.finishedAt = nowIso();
    recoveryStep.durationMs = Date.now() - startedAtMs;
    recoveryStep.status = recovery.every((entry) => entry.ok) ? "pass" : "fail";
    recoveryStep.details = { ok: recovery.every((entry) => entry.ok), recovery };
  }
  return recovery;
}

async function runChaos(run) {
  run.status = "running";
  run.startedAtMs = Date.now();
  run.startedAt = nowIso();
  activeChaosRunId = run.id;
  updateChaosQueueMetrics();

  try {
    for (let index = 0; index < run.scenario.steps.length; index += 1) {
      if (run.abortController.signal.aborted) {
        finishChaosRun(run, "cancelled", "Chaos run was cancelled");
        return;
      }
      const result = await executeChaosStep(run, run.scenario.steps[index], index);
      if (result.status === "blocked") {
        finishChaosRun(run, "blocked_by_safety_cap", run.blockedReason || result.details?.message || "Blocked by safety cap");
        return;
      }
      if (result.status === "fail") {
        await recoverChaosTargets(run);
        finishChaosRun(run, "fail", result.details?.message || `${result.type} step failed`);
        return;
      }
    }
    await recoverChaosTargets(run);
    finishChaosRun(run, "pass");
  } catch (error) {
    await recoverChaosTargets(run).catch(() => []);
    finishChaosRun(run, run.abortController.signal.aborted ? "cancelled" : "fail", error instanceof Error ? error.message : "Chaos run failed");
  }
}

function startNextChaosRun() {
  if (activeChaosRunId !== null || chaosQueue.length === 0) {
    updateChaosQueueMetrics();
    return;
  }
  const nextRunId = chaosQueue.shift();
  const run = chaosRuns.get(nextRunId);
  if (!run || run.status !== "queued") {
    startNextChaosRun();
    return;
  }
  updateChaosQueueMetrics();
  runChaos(run);
}

function enqueueChaosRun(scenario, batchId = null) {
  trimChaosRuns();
  const run = {
    id: crypto.randomUUID(),
    batchId,
    scenario,
    status: "queued",
    phase: "queued",
    queuedAtMs: Date.now(),
    queuedAt: nowIso(),
    startedAtMs: null,
    startedAt: null,
    finishedAtMs: null,
    finishedAt: null,
    completedSteps: 0,
    steps: [],
    observations: [],
    context: {},
    error: null,
    blockedReason: null,
    abortController: new AbortController(),
    children: new Set(),
  };
  chaosRuns.set(run.id, run);
  chaosQueue.push(run.id);
  updateChaosQueueMetrics();
  startNextChaosRun();
  return run;
}

function enqueueChaosBatch(scenarios) {
  trimChaosRuns();
  const batch = {
    id: crypto.randomUUID(),
    createdAtMs: Date.now(),
    createdAt: nowIso(),
    scenarioIds: scenarios.map((scenario) => scenario.id),
    estimatedDurationMs: scenarios.reduce((total, scenario) => total + scenario.estimatedDurationMs, 0),
    runIds: [],
  };
  chaosBatches.set(batch.id, batch);
  scenarios.forEach((scenario) => {
    const run = enqueueChaosRun(scenario, batch.id);
    batch.runIds.push(run.id);
  });
  return batch;
}

async function probeDrilldownTargets() {
  const probes = [
    { target: KPI_DRILLDOWN_TARGETS.prometheus, url: `${MONITORING_PROMETHEUS_BASE_URL}/api/v1/query?query=up` },
    { target: KPI_DRILLDOWN_TARGETS.loki, url: `${MONITORING_LOKI_BASE_URL}/ready` },
    { target: KPI_DRILLDOWN_TARGETS.grafana, url: `${MONITORING_GRAFANA_BASE_URL}/api/health` },
  ];

  return Promise.all(probes.map(async (probe) => {
    const response = await safeFetchText(probe.url);
    return { target: probe.target, success: response.ok };
  }));
}

function extractPrometheusAlertNames(payload) {
  const groups = Array.isArray(payload?.data?.groups) ? payload.data.groups : [];
  return groups.flatMap((group) => (
    Array.isArray(group.rules)
      ? group.rules.map((rule) => String(rule.name || "")).filter((name) => name.length > 0)
      : []
  ));
}

function extractActiveAlertNames(payload) {
  const alerts = Array.isArray(payload?.data?.alerts) ? payload.data.alerts : [];
  return alerts
    .map((alert) => String(alert?.labels?.alertname || ""))
    .filter((name) => name.length > 0);
}

async function probeAlertCoverage(expectedAlertNames) {
  if (expectedAlertNames.length === 0) {
    return false;
  }

  const [rulesResponse, alertsResponse] = await Promise.all([
    safeFetchJson(`${MONITORING_PROMETHEUS_BASE_URL}/api/v1/rules`),
    safeFetchJson(`${MONITORING_PROMETHEUS_BASE_URL}/api/v1/alerts`),
  ]);

  const discoveredAlertNames = new Set([
    ...extractPrometheusAlertNames(rulesResponse.body),
    ...extractActiveAlertNames(alertsResponse.body),
  ]);

  return expectedAlertNames.some((alertName) => discoveredAlertNames.has(alertName));
}

async function probeFalsePositiveAlert(run) {
  if (run?.summary?.passed !== true) {
    return false;
  }

  const alertsResponse = await safeFetchJson(`${MONITORING_PROMETHEUS_BASE_URL}/api/v1/alerts`);
  const activeAlertNames = new Set(extractActiveAlertNames(alertsResponse.body));

  return [
    ...KPI_ALERT_RULES.api,
    ...KPI_ALERT_RULES.order,
    ...KPI_ALERT_RULES.payment,
  ].some((alertName) => activeAlertNames.has(alertName));
}

function hasRequiredMetricFamily(metricsText, telemetryTarget) {
  if (!metricsText.includes(telemetryTarget.metricFamily)) {
    return false;
  }

  return typeof telemetryTarget.metricText === "string"
    ? metricsText.includes(telemetryTarget.metricText)
    : true;
}

function hasRequiredLogEvent(logBody, telemetryTarget) {
  return telemetryTarget.eventNames.some((eventName) => logBody.includes(eventName));
}

async function queryLokiScalar(query) {
  const response = await safeFetchJson(`${MONITORING_LOKI_BASE_URL}/loki/api/v1/query?query=${encodeURIComponent(query)}`);
  if (!response.ok) {
    return { ok: false, value: 0 };
  }

  return { ok: true, value: extractVectorMax(response.body) };
}

async function probeTelemetryCompleteness() {
  const [metricsResponse, logQueryResponse, prometheusTargetResponse, lokiReadyResponse, tempoReadyResponse] = await Promise.all([
    safeFetchText(`${SCENARIO_BACKEND_BASE_URL}/metrics`),
    safeFetchJson(`${MONITORING_LOKI_BASE_URL}/loki/api/v1/query?query=${encodeURIComponent('{service_name="mwa-backend"} |= "event_name"')}`),
    safeFetchJson(`${MONITORING_PROMETHEUS_BASE_URL}/api/v1/query?query=${encodeURIComponent('up{job="mwa-backend"}')}`),
    safeFetchText(`${MONITORING_LOKI_BASE_URL}/ready`),
    safeFetchText(`${process.env.MONITORING_TEMPO_BASE_URL || "http://tempo:3200"}/ready`),
  ]);

  const metricsText = metricsResponse.ok ? metricsResponse.body : "";
  const logBody = logQueryResponse.ok ? JSON.stringify(logQueryResponse.body) : "";
  const successfulEndpoints = KPI_TELEMETRY_ENDPOINTS.filter((telemetryTarget) => (
    hasRequiredMetricFamily(metricsText, telemetryTarget) && hasRequiredLogEvent(logBody, telemetryTarget)
  )).length;
  const businessCompleteness = clampRatio(successfulEndpoints, KPI_TELEMETRY_ENDPOINTS.length);
  const backendScraped = extractVectorMax(prometheusTargetResponse.body) >= 1 ? 1 : 0;
  const lokiReady = lokiReadyResponse.ok ? 1 : 0;
  const tempoReady = tempoReadyResponse.ok ? 1 : 0;

  return (businessCompleteness + backendScraped + lokiReady + tempoReady) / 4;
}

async function probeLabelCoverage() {
  const [allLogs, customerLogs] = await Promise.all([
    queryLokiScalar('sum(count_over_time({service_name="mwa-backend"} | json | request_id != "" [5m]))'),
    queryLokiScalar('sum(count_over_time({service_name="mwa-backend"} | json | customer_id != "" [5m]))'),
  ]);

  if (!allLogs.ok || allLogs.value === 0) {
    return 0;
  }

  return clampRatio(customerLogs.value, allLogs.value);
}

function updateKpiGauges() {
  falsePositiveAlertRatio.set(clampRatio(KPI_STATE.falsePositiveRunsTotal, KPI_STATE.scenarioRunsTotal));
  telemetryCompletenessRatio.set(currentTelemetryCompletenessRatio);
  drilldownSuccessRatio.set(clampRatio(KPI_STATE.drilldownChecksSucceeded, KPI_STATE.drilldownChecksTotal));
  summaryGenerationSuccessRatio.set(clampRatio(KPI_STATE.summaryGenerationsSucceeded, KPI_STATE.summaryGenerationsTotal));
  actionableIncidentCoverageRatio.set(clampRatio(KPI_STATE.actionableIncidentChecksSucceeded, KPI_STATE.actionableIncidentChecksTotal));
  scenarioReproductionRatio.set(clampRatio(KPI_STATE.scenarioRunsPassed, KPI_STATE.scenarioRunsTotal));
}

async function updateMonitoringKpis(scenario, run) {
  KPI_STATE.scenarioRunsTotal += 1;
  const scenarioRunSucceeded = run?.summary?.passed === true;
  if (scenarioRunSucceeded) {
    KPI_STATE.scenarioRunsPassed += 1;
  }
  scenarioRunsTotal.inc({
    result: scenarioRunSucceeded ? KPI_RESULT_LABELS.success : KPI_RESULT_LABELS.failure,
  });

  KPI_STATE.summaryGenerationsTotal += 1;
  const summaryGenerationSucceeded = Boolean(run?.summary && typeof run.summary.passed === "boolean");
  if (summaryGenerationSucceeded) {
    KPI_STATE.summaryGenerationsSucceeded += 1;
  }
  summaryGenerationsTotal.inc({
    result: summaryGenerationSucceeded ? KPI_RESULT_LABELS.success : KPI_RESULT_LABELS.failure,
  });

  const drilldownResults = await probeDrilldownTargets();
  drilldownResults.forEach((probe) => {
    KPI_STATE.drilldownChecksTotal += 1;
    if (probe.success) {
      KPI_STATE.drilldownChecksSucceeded += 1;
    }
    drilldownChecksTotal.inc({
      target: probe.target,
      result: probe.success ? KPI_RESULT_LABELS.success : KPI_RESULT_LABELS.failure,
    });
  });

  const failedScenario = run?.summary?.passed === false;
  const alertCoverageSucceeded = failedScenario
    ? await probeAlertCoverage(getExpectedAlertNames(scenario, run))
    : false;

  if (failedScenario) {
    KPI_STATE.alertCoverageChecksTotal += 1;
    if (alertCoverageSucceeded) {
      KPI_STATE.alertCoverageChecksSucceeded += 1;
    }
    alertCoverageChecksTotal.inc({
      result: alertCoverageSucceeded ? KPI_RESULT_LABELS.success : KPI_RESULT_LABELS.failure,
    });
  }

  const actionableIncidentSucceeded = failedScenario
    && alertCoverageSucceeded
    && drilldownResults.every((probe) => probe.success)
    && summaryGenerationSucceeded;

  if (failedScenario) {
    KPI_STATE.actionableIncidentChecksTotal += 1;
    if (actionableIncidentSucceeded) {
      KPI_STATE.actionableIncidentChecksSucceeded += 1;
    }
    actionableIncidentChecksTotal.inc({
      result: actionableIncidentSucceeded ? KPI_RESULT_LABELS.success : KPI_RESULT_LABELS.failure,
    });
  }

  if (await probeFalsePositiveAlert(run)) {
    KPI_STATE.falsePositiveRunsTotal += 1;
  }

  currentTelemetryCompletenessRatio = await probeTelemetryCompleteness();
  labelCoverageRatio.set(await probeLabelCoverage());
  updateKpiGauges();
}

async function renderScenarioPage() {
  const k6Catalog = await getK6ScenarioCatalog();
  const latestK6Summary = getLatestK6Summary();
  const bootstrapJson = escapeForInlineScript({
    k6: {
      catalog: k6Catalog,
      latestSummary: latestK6Summary,
      runnerEnabled: QA_K6_RUNNER_ENABLED,
      defaultPack: K6_SCENARIO_PACK_DEFAULT,
      command: getK6RunCommand({ pack: K6_SCENARIO_PACK_DEFAULT }),
    },
    templates: SCENARIO_TEMPLATES.map((scenario) => getScenarioPublicSummary(scenario)),
    backendBaseUrl: SCENARIO_BACKEND_BASE_URL,
    chaos: {
      enabled: QA_CHAOS_ENABLED,
      scenarios: getChaosPublicScenarios(),
    },
  });

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scenario Testing Web</title>
  <link rel="stylesheet" href="/qa/scenarios/assets/qa-scenarios.css" />
</head>
<body>
  <main class="shell">
    <header class="app-header">
      <div class="title-block">
        <h1>k6 Scenario Console</h1>
        <p>k6 packs are the primary test workflow. Legacy web checks remain available below.</p>
      </div>
      <div class="header-meta">
        <span class="chip mono">backend ${escapeHtml(SCENARIO_BACKEND_BASE_URL)}</span>
        <span class="chip">${escapeHtml(k6Catalog.scenarios.length)} k6 scenarios</span>
        <span class="chip">${SCENARIO_TEMPLATES.length} legacy checks</span>
        <span class="chip">chaos ${QA_CHAOS_ENABLED ? "enabled" : "disabled"}</span>
      </div>
    </header>

    <section class="runner-layout">
      <section class="panel k6-panel">
        <div class="panel-header">
          <div>
            <h2>k6 Primary Packs</h2>
            <p>Run smoke in CI, then use full packs manually for deeper validation.</p>
          </div>
          <span id="k6-runner-enabled" class="status-pill ${QA_K6_RUNNER_ENABLED ? "status-valid" : "status-neutral"}">${QA_K6_RUNNER_ENABLED ? "RUNNER ENABLED" : "CLI ONLY"}</span>
        </div>
        <div class="k6-layout">
          <div>
            <div id="k6-pack-tabs" class="pack-tabs"></div>
            <div id="k6-scenario-list" class="scenario-list"></div>
          </div>
          <div class="k6-runner">
            <div class="button-row">
              <button id="k6-run-pack-button" class="button-primary" type="button">Run pack</button>
              <button id="k6-run-selected-button" class="button-secondary" type="button">Run selected</button>
              <button id="k6-select-all-button" class="button-ghost" type="button">Select pack</button>
              <button id="k6-clear-button" class="button-ghost" type="button">Clear</button>
            </div>
            <div id="k6-summary-grid" class="summary-grid"></div>
            <div id="k6-status" class="result-list"></div>
          </div>
        </div>
      </section>

      <section class="panel control-panel">
        <div class="control-main">
          <div>
            <h2>Legacy Web Checks</h2>
            <p>Compatibility runner for the previous web-defined checks.</p>
          </div>
          <div class="button-row">
            <button id="run-all-button" class="button-primary" type="button">Run all</button>
            <button id="run-selected-button" class="button-secondary" type="button">Run selected</button>
            <button id="select-all-button" class="button-ghost" type="button">Select all</button>
            <button id="clear-button" class="button-ghost" type="button">Clear</button>
          </div>
        </div>
        <div class="progress-wrap">
          <div class="progress-head">
            <span id="run-status" class="status-pill status-neutral" role="status" aria-live="polite">Ready</span>
            <span id="selected-count" class="muted tiny">0 selected</span>
          </div>
          <div class="progress-track" aria-hidden="true"><div id="progress-bar" class="progress-bar"></div></div>
        </div>
      </section>

      <section class="content-grid">
        <section class="panel scenario-panel">
          <div class="panel-header">
            <h2>Checklist</h2>
            <span id="template-count" class="chip">0</span>
          </div>
          <div id="scenario-list" class="scenario-list"></div>
        </section>

        <section class="panel result-panel">
          <div class="panel-header">
            <h2>Results</h2>
            <span id="run-id" class="chip mono">no run</span>
          </div>
          <div id="summary-grid" class="summary-grid"></div>
          <div id="result-list" class="result-list">
            <div class="empty-state">Run all or selected scenarios to see results.</div>
          </div>
        </section>
      </section>

      <section class="panel chaos-panel">
        <div class="panel-header">
          <div>
            <h2>Chaos Runs</h2>
            <p>전용 로컬/데모 스택에서 실제 부하와 장애를 장시간 주입합니다.</p>
          </div>
          <span id="chaos-enabled" class="status-pill ${QA_CHAOS_ENABLED ? "status-valid" : "status-neutral"}">${QA_CHAOS_ENABLED ? "ENABLED" : "DISABLED"}</span>
        </div>
        <div class="chaos-layout">
          <div id="chaos-list" class="chaos-list"></div>
          <div class="chaos-runner">
            <div class="button-row">
              <button id="chaos-run-all-button" class="button-primary" type="button">Run all chaos</button>
              <button id="chaos-run-selected-button" class="button-secondary" type="button">Run selected</button>
              <button id="chaos-select-all-button" class="button-ghost" type="button">Select all</button>
              <button id="chaos-clear-button" class="button-ghost" type="button">Clear</button>
              <button id="chaos-cancel-button" class="button-secondary" type="button">Cancel active</button>
              <button id="chaos-recover-button" class="button-ghost" type="button">Recover all</button>
            </div>
            <div id="chaos-summary-grid" class="summary-grid"></div>
            <div id="chaos-status" class="chaos-status">
              <div class="empty-state">Select a chaos scenario to see details.</div>
            </div>
          </div>
        </div>
      </section>
    </section>
  </main>

  <script id="qa-scenarios-bootstrap" type="application/json">${bootstrapJson}</script>
  <script src="/qa/scenarios/assets/qa-scenarios.js" defer></script>
</body>
</html>`;
}

function renderPage() {
  const productRows = PRODUCTS.map(
    (p) => `
  <article class="card">
    <div class="card-body">
      <h2>${escapeHtml(p.name)}</h2>
      <p class="price">${p.price.toLocaleString("ko-KR")}원</p>
      <form method="post" action="/action">
        <input type="hidden" name="action" value="buy" />
        <input type="hidden" name="product_id" value="${escapeHtml(p.id)}" />
        <button type="submit">이 상품 구매</button>
      </form>
    </div>
  </article>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MWA 데모 쇼핑</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 2rem auto; padding: 0 1rem; background: #f6f7f9; }
    h1 { font-size: 1.35rem; margin-bottom: 0.25rem; }
    .lead { color: #444; margin: 0 0 1rem; font-size: 0.95rem; }
    .muted { color: #666; font-size: 0.85rem; }
    .card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 0.75rem; overflow: hidden; }
    .card-body { padding: 1rem 1.1rem; }
    .card h2 { font-size: 1.05rem; margin: 0 0 0.35rem; }
    .price { font-weight: 600; color: #1a5f2a; margin: 0 0 0.75rem; }
    button { width: 100%; padding: 0.65rem; cursor: pointer; font-size: 0.95rem; border-radius: 8px; border: 1px solid #ccc; background: #fff; }
    button:hover { background: #f0f4ff; border-color: #99b; }
    .random { margin: 1rem 0; padding: 1rem; background: #eef3ff; border-radius: 12px; border: 1px dashed #88a; }
    .random button { background: #2c4bff; color: #fff; border: none; font-weight: 600; }
    .random button:hover { background: #1f3ae0; }
    .legacy { margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #ddd; }
    .legacy form { margin: 0.4rem 0; }
    .legacy button { font-size: 0.88rem; padding: 0.5rem; }
  </style>
</head>
<body>
  <h1>MWA 데모 쇼핑</h1>
  <p class="lead">상품을 구매하면 JSON 로그(Loki)·메트릭(Prometheus)에 <strong>상품 id·주문 번호</strong>가 남습니다.</p>
  <p class="muted">stdout + 파일 로그 · README「애플리케이션 로그 연동」</p>

  ${productRows}

  <div class="random">
    <p class="muted" style="margin:0 0 0.5rem">서버가 카탈로그에서 <strong>무작위로 하나</strong> 골라 주문 이벤트를 남깁니다.</p>
    <form method="post" action="/action">
      <input type="hidden" name="action" value="buy_random" />
      <button type="submit">랜덤 상품 구매 시뮬레이션</button>
    </form>
  </div>

  <section class="legacy">
    <p class="muted">기존 데모 액션 (메트릭 action 라벨용)</p>
    <form method="post" action="/action">
      <input type="hidden" name="action" value="add_to_cart" />
      <button type="submit">장바구니 담기</button>
    </form>
    <form method="post" action="/action">
      <input type="hidden" name="action" value="checkout" />
      <button type="submit">주문하기</button>
    </form>
    <form method="post" action="/action">
      <input type="hidden" name="action" value="view_product" />
      <button type="submit">상품 상세 보기</button>
    </form>
  </section>

  <p class="muted"><a href="/metrics">/metrics</a> — Prometheus · <code>mwa_product_orders_total</code></p>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequests = new client.Counter({
  name: "mwa_http_requests_total",
  help: "HTTP 요청 수",
  labelNames: ["method", "path", "status"],
  registers: [register],
});

const buttonClicks = new client.Counter({
  name: "mwa_button_clicks_total",
  help: "버튼(액션) 클릭 수",
  labelNames: ["action"],
  registers: [register],
});

const productOrders = new client.Counter({
  name: "mwa_product_orders_total",
  help: "상품별 구매(주문) 건수 — 데모",
  labelNames: ["product_id"],
  registers: [register],
});

const summaryGenerationsTotal = new client.Counter({
  name: "mwa_monitoring_summary_generations_total",
  help: "시나리오 실행 후 summary 생성 결과 누적 수",
  labelNames: ["result"],
  registers: [register],
});

const scenarioRunsTotal = new client.Counter({
  name: "mwa_monitoring_scenario_runs_total",
  help: "시나리오 실행 결과 누적 수",
  labelNames: ["result"],
  registers: [register],
});

const drilldownChecksTotal = new client.Counter({
  name: "mwa_monitoring_drilldown_checks_total",
  help: "Prometheus/Loki/Grafana 드릴다운 프로브 결과 누적 수",
  labelNames: ["target", "result"],
  registers: [register],
});

const alertCoverageChecksTotal = new client.Counter({
  name: "mwa_monitoring_alert_coverage_checks_total",
  help: "실패 시나리오 alert coverage 점검 결과 누적 수",
  labelNames: ["result"],
  registers: [register],
});

const actionableIncidentChecksTotal = new client.Counter({
  name: "mwa_monitoring_actionable_incident_checks_total",
  help: "행동 가능한 인시던트 coverage 점검 결과 누적 수",
  labelNames: ["result"],
  registers: [register],
});

const falsePositiveAlertRatio = new client.Gauge({
  name: "mwa_monitoring_false_positive_alert_ratio",
  help: "passed summary 대비 false positive alert 비율",
  registers: [register],
});

const telemetryCompletenessRatio = new client.Gauge({
  name: "mwa_monitoring_telemetry_completeness_ratio",
  help: "핵심 endpoint 텔레메트리 완전성 비율",
  registers: [register],
});

const labelCoverageRatio = new client.Gauge({
  name: "mwa_monitoring_label_coverage_ratio",
  help: "최근 backend 로그 중 customer_id 라벨이 채워진 요청 비율",
  registers: [register],
});

const drilldownSuccessRatio = new client.Gauge({
  name: "mwa_monitoring_drilldown_success_ratio",
  help: "드릴다운 프로브 성공 비율",
  registers: [register],
});

const summaryGenerationSuccessRatio = new client.Gauge({
  name: "mwa_monitoring_summary_generation_success_ratio",
  help: "summary 생성 성공 비율",
  registers: [register],
});

const actionableIncidentCoverageRatio = new client.Gauge({
  name: "mwa_monitoring_actionable_incident_coverage_ratio",
  help: "행동 가능한 인시던트 coverage 비율",
  registers: [register],
});

const scenarioReproductionRatio = new client.Gauge({
  name: "mwa_monitoring_scenario_reproduction_ratio",
  help: "시나리오 재현 성공 비율",
  registers: [register],
});

const chaosRunsTotal = new client.Counter({
  name: "mwa_chaos_runs_total",
  help: "QA chaos run results",
  labelNames: ["result"],
  registers: [register],
});

const chaosQueueBacklog = new client.Gauge({
  name: "mwa_chaos_queue_backlog",
  help: "Queued QA chaos runs waiting for execution",
  registers: [register],
});

const chaosQueueOldestAgeSeconds = new client.Gauge({
  name: "mwa_chaos_queue_oldest_age_seconds",
  help: "Age in seconds of the oldest queued QA chaos run",
  registers: [register],
});

const chaosActiveWorkers = new client.Gauge({
  name: "mwa_chaos_active_workers",
  help: "Active QA chaos workers inside the demo runner",
  registers: [register],
});

const averageOrderValueWon = new client.Gauge({
  name: "mwa_average_order_value_won",
  help: "Configured average order value used for demo revenue loss estimates",
  registers: [register],
});

summaryGenerationsTotal.inc({ result: KPI_RESULT_LABELS.success }, 0);
summaryGenerationsTotal.inc({ result: KPI_RESULT_LABELS.failure }, 0);
scenarioRunsTotal.inc({ result: KPI_RESULT_LABELS.success }, 0);
scenarioRunsTotal.inc({ result: KPI_RESULT_LABELS.failure }, 0);
Object.values(KPI_DRILLDOWN_TARGETS).forEach((target) => {
  drilldownChecksTotal.inc({ target, result: KPI_RESULT_LABELS.success }, 0);
  drilldownChecksTotal.inc({ target, result: KPI_RESULT_LABELS.failure }, 0);
});
alertCoverageChecksTotal.inc({ result: KPI_RESULT_LABELS.success }, 0);
alertCoverageChecksTotal.inc({ result: KPI_RESULT_LABELS.failure }, 0);
actionableIncidentChecksTotal.inc({ result: KPI_RESULT_LABELS.success }, 0);
actionableIncidentChecksTotal.inc({ result: KPI_RESULT_LABELS.failure }, 0);
chaosRunsTotal.inc({ result: "success" }, 0);
chaosRunsTotal.inc({ result: "failure" }, 0);
chaosRunsTotal.inc({ result: "blocked" }, 0);
averageOrderValueWon.set(CHAOS_AVERAGE_ORDER_VALUE_WON);
updateKpiGauges();
updateChaosQueueMetrics();

const app = express();
app.use(
  "/qa/scenarios/assets",
  express.static(path.join(__dirname, "public", "qa-scenarios"), {
    immutable: false,
    maxAge: "5m",
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

morgan.token("body", (req) => {
  if (req.method === "POST" && req.body && typeof req.body === "object") {
    return JSON.stringify(req.body);
  }
  return "-";
});

app.use(
  morgan(
    ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" body=:body',
    {
      stream: {
        write: (line) => {
          const l = `${line.trim()}\n`;
          process.stdout.write(l);
          appendLog(LOG_ACCESS, l);
        },
      },
    }
  )
);

app.use((req, res, next) => {
  res.on("finish", () => {
    const routePath = req.route?.path || req.path || "unknown";
    httpRequests.inc({
      method: req.method,
      path: String(routePath),
      status: String(res.statusCode),
    });
  });
  next();
});

app.get("/", (_req, res) => {
  res.type("html").send(renderPage());
});

app.get("/qa/scenarios", async (_req, res) => {
  res.type("html").send(await renderScenarioPage());
});

app.get("/qa/scenarios/k6/catalog", async (_req, res) => {
  const catalog = await getK6ScenarioCatalog();
  res.json({
    success: catalog.error === null,
    catalog,
  });
});

app.get("/qa/scenarios/k6/latest-summary", (_req, res) => {
  res.json({
    success: true,
    latestSummary: getLatestK6Summary(),
  });
});

app.post("/qa/scenarios/k6/run", async (req, res) => {
  const scenarioIds = Array.isArray(req.body?.scenarioIds)
    ? req.body.scenarioIds.map((scenarioId) => String(scenarioId)).filter(Boolean)
    : [];
  const pack = String(req.body?.pack || K6_SCENARIO_PACK_DEFAULT);
  const command = getK6RunCommand({ scenarioIds, pack });

  if (!QA_K6_RUNNER_ENABLED) {
    res.status(501).json({
      success: false,
      runnerEnabled: false,
      command,
      errors: ["k6 web runner is disabled. Run the command from the repository root."],
    });
    return;
  }

  const cliPath = firstExistingPath(K6_RUNNER_CLI_PATHS);
  if (cliPath === null) {
    res.status(500).json({
      success: false,
      runnerEnabled: true,
      command,
      errors: ["k6 runner CLI was not found."],
    });
    return;
  }

  const args = [cliPath, "k6"];
  if (scenarioIds.length > 0) {
    args.push("--scenario", scenarioIds.join(","));
  } else {
    args.push("--pack", pack);
  }

  const child = spawn(process.execPath, args, {
    cwd: path.dirname(path.dirname(path.dirname(path.dirname(cliPath)))),
    env: {
      ...process.env,
      BASE_URL: SCENARIO_BACKEND_BASE_URL,
      RESET_SEED: "true",
      SLEEP_SECONDS: process.env.K6_WEB_SLEEP_SECONDS || "0.2",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.on("close", (code) => {
    res.status(code === 0 ? 200 : 500).json({
      success: code === 0,
      runnerEnabled: true,
      command,
      exitCode: code,
      stdout,
      stderr,
    });
  });
});

app.post("/qa/scenarios/run", async (req, res) => {
  const scenario = req.body?.scenario;
  const errors = validateScenarioShape(scenario);

  if (errors.length > 0) {
    res.status(400).json({
      success: false,
      errors,
    });
    return;
  }

  if (req.body?.dryRun === true) {
    res.json({
      success: true,
      errors: [],
    });
    return;
  }

  const run = await executeScenario(scenario);
  await updateMonitoringKpis(scenario, run);
  res.json({
    success: true,
    run,
  });
});

app.post("/qa/scenarios/run-batch", async (req, res) => {
  const scenarioIds = req.body?.scenarioIds;

  if (!Array.isArray(scenarioIds) || scenarioIds.length === 0) {
    res.status(400).json({
      success: false,
      errors: ["scenarioIds는 1개 이상의 시나리오 id 배열이어야 합니다."],
    });
    return;
  }

  const uniqueScenarioIds = [...new Set(scenarioIds.map((scenarioId) => String(scenarioId)))];
  const scenarios = uniqueScenarioIds.map((scenarioId) => getScenarioTemplateById(scenarioId));
  const missingScenarioIds = uniqueScenarioIds.filter((_scenarioId, index) => scenarios[index] === null);

  if (missingScenarioIds.length > 0) {
    res.status(400).json({
      success: false,
      errors: missingScenarioIds.map((scenarioId) => `Unknown scenario id: ${scenarioId}`),
    });
    return;
  }

  const validationErrors = scenarios.flatMap((scenario) => (
    validateScenarioShape(scenario).map((error) => `${scenario.id}: ${error}`)
  ));

  if (validationErrors.length > 0) {
    res.status(400).json({
      success: false,
      errors: validationErrors,
    });
    return;
  }

  try {
    const batchRun = await executeScenarioBatch(scenarios);
    res.json(batchRun);
  } catch (error) {
    res.status(500).json({
      success: false,
      errors: [error instanceof Error ? error.message : "Batch execution failed"],
    });
  }
});

app.get("/qa/chaos/scenarios", (_req, res) => {
  res.json({
    success: true,
    enabled: QA_CHAOS_ENABLED,
    scenarios: getChaosPublicScenarios(),
  });
});

app.get("/qa/chaos/runs", (_req, res) => {
  const runs = getAllChaosRuns();
  res.json({
    success: true,
    enabled: QA_CHAOS_ENABLED,
    summary: getChaosRunSummary(runs),
    runs: runs.map(formatChaosRun),
  });
});

app.get("/qa/chaos/batches/:batchId", (req, res) => {
  const batch = chaosBatches.get(req.params.batchId);
  if (!batch) {
    res.status(404).json({
      success: false,
      errors: [`Unknown chaos batch id: ${req.params.batchId}`],
    });
    return;
  }

  res.json({
    success: true,
    batch: formatChaosBatch(batch),
  });
});

app.post("/qa/chaos/runs", (req, res) => {
  try {
    assertChaosEnabled();
    const scenarioId = String(req.body?.scenarioId || "");
    const scenario = findChaosScenario(scenarioId);
    if (scenario === null) {
      res.status(400).json({
        success: false,
        errors: [`Unknown chaos scenario id: ${scenarioId}`],
      });
      return;
    }
    const run = enqueueChaosRun(scenario);
    res.status(202).json({
      success: true,
      run: formatChaosRun(run),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      errors: [error instanceof Error ? error.message : "Unable to start chaos run"],
    });
  }
});

app.post("/qa/chaos/run-batch", (req, res) => {
  try {
    assertChaosEnabled();
    const scenarioIds = Array.isArray(req.body?.scenarioIds)
      ? [...new Set(req.body.scenarioIds.map((scenarioId) => String(scenarioId)))]
      : [];
    if (scenarioIds.length === 0) {
      res.status(400).json({
        success: false,
        errors: ["scenarioIds must contain at least one chaos scenario id"],
      });
      return;
    }

    const scenarios = scenarioIds.map((scenarioId) => findChaosScenario(scenarioId));
    const missingScenarioIds = scenarioIds.filter((_scenarioId, index) => scenarios[index] === null);
    if (missingScenarioIds.length > 0) {
      res.status(400).json({
        success: false,
        errors: missingScenarioIds.map((scenarioId) => `Unknown chaos scenario id: ${scenarioId}`),
      });
      return;
    }

    const batch = enqueueChaosBatch(scenarios);
    res.status(202).json({
      success: true,
      batch: formatChaosBatch(batch),
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      errors: [error instanceof Error ? error.message : "Unable to start chaos batch"],
    });
  }
});

app.get("/qa/chaos/runs/:runId", (req, res) => {
  const run = chaosRuns.get(req.params.runId);
  if (!run) {
    res.status(404).json({
      success: false,
      errors: [`Unknown chaos run id: ${req.params.runId}`],
    });
    return;
  }
  res.json({
    success: true,
    run: formatChaosRun(run),
  });
});

app.post("/qa/chaos/runs/:runId/cancel", async (req, res) => {
  const run = chaosRuns.get(req.params.runId);
  if (!run) {
    res.status(404).json({
      success: false,
      errors: [`Unknown chaos run id: ${req.params.runId}`],
    });
    return;
  }

  run.abortController.abort();
  if (run.status === "queued") {
    const queueIndex = chaosQueue.indexOf(run.id);
    if (queueIndex >= 0) {
      chaosQueue.splice(queueIndex, 1);
    }
    finishChaosRun(run, "cancelled", "Chaos run was cancelled before start");
  } else {
    await recoverChaosTargets(run);
    finishChaosRun(run, "cancelled", "Chaos run was cancelled");
  }
  res.json({
    success: true,
    run: formatChaosRun(run),
  });
});

app.post("/qa/chaos/recover", async (_req, res) => {
  try {
    assertChaosEnabled();
    for (const run of chaosRuns.values()) {
      if (run.status === "running" || run.status === "queued") {
        run.abortController.abort();
        releaseChaosResources(run);
        if (run.status === "queued") {
          const queueIndex = chaosQueue.indexOf(run.id);
          if (queueIndex >= 0) chaosQueue.splice(queueIndex, 1);
        }
        finishChaosRun(run, "cancelled", "Cancelled by global recovery", { startNext: false });
      }
    }
    const recovery = await recoverChaosTargets();
    updateChaosQueueMetrics();
    res.json({
      success: true,
      recovery,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      errors: [error instanceof Error ? error.message : "Chaos recovery failed"],
    });
  }
});

function logOrderEvent(payload) {
  const line = JSON.stringify(payload);
  console.log(line);
  appendLog(LOG_APP, line);
}

app.post("/action", (req, res) => {
  const action = (req.body && req.body.action) || "unknown";
  buttonClicks.inc({ action });

  let product = null;
  if (action === "buy_random") {
    product = pickRandomProduct();
  } else if (action === "buy" && req.body && req.body.product_id) {
    product = PRODUCTS.find((p) => p.id === req.body.product_id) || null;
  }

  if (product) {
    const orderId = `ord_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    productOrders.inc({ product_id: product.id });
    logOrderEvent({
      event: "order_placed",
      action,
      order_id: orderId,
      product_id: product.id,
      product_name: product.name,
      price_won: product.price,
      ts: new Date().toISOString(),
    });
  } else {
    const msg = { event: "button_click", action, ts: new Date().toISOString() };
    logOrderEvent(msg);
  }

  res.redirect("/");
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.get("/health", async (_req, res) => {
  if (!isPrismaEnabled) {
    res.json({ ok: true, db: "disabled" });
    return;
  }

  try {
    await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" LIMIT 1`;
    res.json({ ok: true, db: "up" });
  } catch (error) {
    res.status(503).json({ ok: false, db: "down", message: "database unavailable" });
  }
});

app.listen(PORT, HOST, () => {
  const line = JSON.stringify({
    event: "server_start",
    host: HOST,
    port: PORT,
    catalog_skus: PRODUCTS.map((p) => p.id),
    ts: new Date().toISOString(),
  });
  console.log(line);
  appendLog(LOG_APP, line);
});

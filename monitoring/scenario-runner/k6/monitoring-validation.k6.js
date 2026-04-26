import exec from "k6/execution";
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:8080";
const SCENARIO_IDS = parseScenarioIds(__ENV.SCENARIO_IDS || __ENV.SCENARIO_ID || "fault-search-delay");
const DURATION = __ENV.DURATION || "5m";
const VUS = Number(__ENV.VUS || "4");
const SUMMARY_EXPORT = __ENV.SUMMARY_EXPORT || "monitoring/scenario-runner/results/summary.json";
const RESET_SEED = (__ENV.RESET_SEED || "true") !== "false";

const BUYER_ONE = "11111111-1111-4111-8111-111111111111";
const BUYER_TWO = "11111111-1111-4111-8111-111111111112";
const ADDRESS_ONE = "22222222-2222-4222-8222-222222222221";
const ADDRESS_TWO = "22222222-2222-4222-8222-222222222222";
const NOTEBOOK_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MUG_VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const NOTEBOOK_PRODUCT = "77777777-7777-4777-8777-777777777771";
const STICKER_PRODUCT = "77777777-7777-4777-8777-777777777773";
const MISSING_PRODUCT = "00000000-0000-4000-8000-000000000009";
const BUYER_ONE_ACTIVE_CART_ITEM = "44444444-4444-4444-8444-444444444441";
const SEEDED_FAILURE_ORDER = "55555555-5555-4555-8555-555555555552";
const SEEDED_SUCCESS_ORDER = "55555555-5555-4555-8555-555555555551";

const scenarioFailureRate = new Rate("mwa_scenario_failed");
const scenarioDuration = new Trend("mwa_scenario_duration", true);

export const options = {
  scenarios: {
    monitoring_validation: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
      gracefulStop: "10s",
    },
  },
  thresholds: {
    checks: ["rate>0.95"],
    mwa_scenario_failed: ["rate<0.05"],
  },
};

const scenarioHandlers = {
  "business-success-funnel": businessSuccessFunnel,
  "buyer-payment-failure": buyerPaymentFailure,
  "health-success": healthSuccess,
  "metrics-text-check": metricsTextCheck,
  "health-metrics-parallel": healthMetricsParallel,
  "catalog-list-success": catalogListSuccess,
  "catalog-price-sort": catalogPriceSort,
  "catalog-product-not-found": catalogProductNotFound,
  "search-notebook-success": searchNotebookSuccess,
  "search-zero-result": searchZeroResult,
  "search-validation-failure": searchValidationFailure,
  "recommendation-success": recommendationSuccess,
  "recommendation-limit-validation": recommendationLimitValidation,
  "buyer-success-funnel": buyerSuccessFunnel,
  "buyer-failure-funnel": buyerFailureFunnel,
  "buyer-cart-validation-failure": buyerCartValidationFailure,
  "buyer-cart-add-delete-roundtrip": buyerCartAddDeleteRoundtrip,
  "buyer-empty-cart-checkout-conflict": buyerEmptyCartCheckoutConflict,
  "buyer-payment-validation-failure": buyerPaymentValidationFailure,
  "buyer-cross-order-access-denied": buyerCrossOrderAccessDenied,
  "route-not-found": routeNotFound,
  "fault-search-delay": faultSearchDelay,
  "fault-cart-delay": faultCartDelay,
  "fault-order-delay": faultOrderDelay,
  "fault-payment-delay": faultPaymentDelay,
  "fault-search-error": faultSearchError,
  "fault-unhandled-exception": faultUnhandledException,
  "validation-4xx-burst": validation4xxBurst,
  "payment-failure-types": paymentFailureTypes,
  "label-coverage-missing-buyer": labelCoverageMissingBuyer,
};

export function setup() {
  const missing = SCENARIO_IDS.filter((scenarioId) => !scenarioHandlers[scenarioId]);
  if (missing.length > 0) {
    throw new Error(`Unknown k6 scenario id(s): ${missing.join(", ")}`);
  }

  if (RESET_SEED) {
    http.post(`${BASE_URL}/contract/qa/reset-seed`, null, {
      tags: { scenario_id: "setup", endpoint: "reset-seed" },
      timeout: "30s",
    });
  }

  return {
    scenarioIds: SCENARIO_IDS,
    startedAt: new Date().toISOString(),
  };
}

export default function runSelectedScenarios(data) {
  const scenarioId = data.scenarioIds[(exec.scenario.iterationInTest + exec.vu.idInTest) % data.scenarioIds.length];
  const startedAt = Date.now();
  let passed = false;

  try {
    passed = scenarioHandlers[scenarioId]();
  } finally {
    scenarioFailureRate.add(!passed, { scenario_id: scenarioId });
    scenarioDuration.add(Date.now() - startedAt, { scenario_id: scenarioId });
  }

  sleep(Number(__ENV.SLEEP_SECONDS || "1"));
}

export function handleSummary(data) {
  const output = {};
  output[SUMMARY_EXPORT] = JSON.stringify(data, null, 2);
  output.stdout = [
    "",
    "MWA monitoring validation summary",
    `scenarios=${SCENARIO_IDS.join(",")}`,
    `baseUrl=${BASE_URL}`,
    `summary=${SUMMARY_EXPORT}`,
    "",
  ].join("\n");
  return output;
}

function parseScenarioIds(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueSuffix(prefix) {
  return `${prefix}-${exec.vu.idInTest}-${exec.scenario.iterationInTest}-${Date.now()}`;
}

function request(method, path, options = {}) {
  const headers = {
    Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    "x-request-id": uniqueSuffix(options.requestPrefix || "k6"),
    ...(options.headers || {}),
  };
  const body = options.body === undefined ? null : JSON.stringify(options.body);
  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  return http.request(method, `${BASE_URL}${path}`, body, {
    headers,
    timeout: options.timeout || "30s",
    tags: {
      scenario_id: options.scenarioId || "unknown",
      endpoint: options.endpoint || path.split("?")[0],
    },
  });
}

function statusCheck(response, expected, label) {
  return check(response, {
    [`${label} status ${expected}`]: (candidate) => candidate.status === expected,
  });
}

function jsonCheck(response, path, expected, label) {
  return check(response, {
    [`${label} ${path}=${expected}`]: (candidate) => jsonValue(candidate, path) === expected,
  });
}

function textIncludesCheck(response, value, label) {
  return check(response, {
    [`${label} includes ${value}`]: (candidate) => String(candidate.body || "").includes(value),
  });
}

function contentTypeIncludesCheck(response, value, label) {
  return check(response, {
    [`${label} content-type includes ${value}`]: (candidate) => {
      const contentType = candidate.headers["Content-Type"] || candidate.headers["content-type"] || "";
      return contentType.includes(value);
    },
  });
}

function jsonValue(response, path) {
  try {
    return response.json(path);
  } catch (_error) {
    return undefined;
  }
}

function getCart(scenarioId, customerId) {
  const response = request("GET", "/api/cart", {
    scenarioId,
    endpoint: "/api/cart",
    headers: { "x-customer-id": customerId },
  });
  const passed = statusCheck(response, 200, `${scenarioId} cart get`);
  return { passed, response };
}

function updateCartItem(scenarioId, customerId, cartItemId, quantity) {
  const response = request("PATCH", `/api/cart/items/${cartItemId}`, {
    scenarioId,
    endpoint: "/api/cart/items/:cartItemId",
    headers: { "x-customer-id": customerId },
    body: { quantity },
  });
  const passed = statusCheck(response, quantity <= 0 ? 400 : 200, `${scenarioId} cart update`);
  return { passed, response };
}

function deleteCartItem(scenarioId, customerId, cartItemId) {
  const response = request("DELETE", `/api/cart/items/${cartItemId}`, {
    scenarioId,
    endpoint: "/api/cart/items/:cartItemId",
    headers: { "x-customer-id": customerId },
  });
  const passed = statusCheck(response, 200, `${scenarioId} cart delete`);
  return { passed, response };
}

function getOrder(scenarioId, customerId, orderId, expectedStatus = 200) {
  const response = request("GET", `/api/orders/${orderId}`, {
    scenarioId,
    endpoint: "/api/orders/:orderId",
    headers: { "x-customer-id": customerId },
  });
  const passed = statusCheck(response, expectedStatus, `${scenarioId} order get`);
  return { passed, response };
}

function searchNotebook(scenarioId, headers = {}) {
  const response = request("GET", "/api/search?q=Notebook&page=1&limit=5", {
    scenarioId,
    endpoint: "/api/search",
    headers,
    timeout: "45s",
  });
  return statusCheck(response, headers["x-mwa-fault"] === "error" || headers["x-mwa-fault"] === "unhandled" ? 500 : 200, `${scenarioId} search`);
}

function addCartItem(scenarioId, customerId, variantId, headers = {}) {
  const response = request("POST", "/api/cart/items", {
    scenarioId,
    endpoint: "/api/cart/items",
    headers: {
      "x-customer-id": customerId,
      ...headers,
    },
    body: {
      variantId,
      quantity: 1,
    },
    timeout: "45s",
  });
  const passed = statusCheck(response, 201, `${scenarioId} cart add`);
  return { passed, response };
}

function createOrder(scenarioId, customerId, cartId, addressId, headers = {}) {
  const response = request("POST", "/api/orders", {
    scenarioId,
    endpoint: "/api/orders",
    headers: {
      "x-customer-id": customerId,
      ...headers,
    },
    body: {
      cartId,
      addressId,
    },
    timeout: "45s",
  });
  const passed = statusCheck(response, 201, `${scenarioId} order create`);
  return { passed, response };
}

function createPayment(scenarioId, customerId, orderId, outcome, failureCode, headers = {}) {
  const body = {
    requestKey: uniqueSuffix(`${scenarioId}-payment`),
    outcome,
  };
  if (failureCode) {
    body.failureCode = failureCode;
  }

  const response = request("POST", `/api/orders/${orderId}/payment-attempts`, {
    scenarioId,
    endpoint: "/api/orders/:orderId/payment-attempts",
    headers: {
      "x-customer-id": customerId,
      ...headers,
    },
    body,
    timeout: "45s",
  });
  const passed = statusCheck(response, 201, `${scenarioId} payment ${outcome}`);
  return { passed, response };
}

function healthSuccess() {
  const scenarioId = "health-success";
  const response = request("GET", "/health", { scenarioId, endpoint: "/health" });
  return statusCheck(response, 200, scenarioId)
    && jsonCheck(response, "success", true, scenarioId)
    && jsonCheck(response, "data.status", "ok", scenarioId);
}

function metricsTextCheck() {
  const scenarioId = "metrics-text-check";
  const response = request("GET", "/metrics", { scenarioId, endpoint: "/metrics" });
  return statusCheck(response, 200, scenarioId)
    && contentTypeIncludesCheck(response, "text/plain", scenarioId)
    && textIncludesCheck(response, "mwa_http_requests_total", scenarioId);
}

function healthMetricsParallel() {
  const scenarioId = "health-metrics-parallel";
  const health = request("GET", "/health", { scenarioId, endpoint: "/health" });
  const metrics = request("GET", "/metrics", { scenarioId, endpoint: "/metrics" });
  return statusCheck(health, 200, `${scenarioId} health`)
    && jsonCheck(health, "success", true, `${scenarioId} health`)
    && jsonCheck(health, "data.status", "ok", `${scenarioId} health`)
    && statusCheck(metrics, 200, `${scenarioId} metrics`)
    && contentTypeIncludesCheck(metrics, "text/plain", `${scenarioId} metrics`)
    && textIncludesCheck(metrics, "mwa_http_requests_total", `${scenarioId} metrics`);
}

function catalogListSuccess() {
  const scenarioId = "catalog-list-success";
  const response = request("GET", "/api/catalog/products?page=1&limit=2&sort=newest", {
    scenarioId,
    endpoint: "/api/catalog/products",
  });
  return statusCheck(response, 200, scenarioId)
    && jsonCheck(response, "success", true, scenarioId)
    && jsonCheck(response, "meta.pagination.page", 1, scenarioId)
    && jsonCheck(response, "meta.pagination.limit", 2, scenarioId)
    && jsonCheck(response, "meta.pagination.total", 6, scenarioId)
    && jsonCheck(response, "data.items.0.product_id", NOTEBOOK_PRODUCT, scenarioId)
    && jsonCheck(response, "data.items.0.title", "Monitoring Notebook", scenarioId);
}

function catalogPriceSort() {
  const scenarioId = "catalog-price-sort";
  const response = request("GET", "/api/catalog/products?sort=price_asc", {
    scenarioId,
    endpoint: "/api/catalog/products",
  });
  return statusCheck(response, 200, scenarioId)
    && jsonCheck(response, "success", true, scenarioId)
    && jsonCheck(response, "data.items.0.product_id", STICKER_PRODUCT, scenarioId)
    && jsonCheck(response, "data.items.0.title", "Alert Sticker Pack", scenarioId)
    && jsonCheck(response, "data.items.0.price_summary.lowest_current_price", "5900.00", scenarioId);
}

function catalogProductNotFound() {
  const scenarioId = "catalog-product-not-found";
  const response = request("GET", `/api/catalog/products/${MISSING_PRODUCT}`, {
    scenarioId,
    endpoint: "/api/catalog/products/:productId",
  });
  return statusCheck(response, 404, scenarioId)
    && jsonCheck(response, "error.code", "NOT_FOUND", scenarioId)
    && jsonCheck(response, "error.message", "Catalog product not found", scenarioId);
}

function searchNotebookSuccess() {
  const scenarioId = "search-notebook-success";
  const response = request("GET", "/api/search?q=Notebook&page=1&limit=5", {
    scenarioId,
    endpoint: "/api/search",
  });
  return statusCheck(response, 200, scenarioId)
    && jsonCheck(response, "success", true, scenarioId)
    && jsonCheck(response, "meta.pagination.page", 1, scenarioId)
    && jsonCheck(response, "data.items.0.product_id", NOTEBOOK_PRODUCT, scenarioId)
    && jsonCheck(response, "data.items.0.title", "Monitoring Notebook", scenarioId);
}

function searchZeroResult() {
  const scenarioId = "search-zero-result";
  const response = request("GET", "/api/search?q=zzz&page=1&limit=20", {
    scenarioId,
    endpoint: "/api/search",
  });
  return statusCheck(response, 200, scenarioId)
    && jsonCheck(response, "success", true, scenarioId)
    && jsonCheck(response, "meta.pagination.total", 0, scenarioId)
    && jsonCheck(response, "meta.pagination.totalPages", 1, scenarioId);
}

function searchValidationFailure() {
  const scenarioId = "search-validation-failure";
  const response = request("GET", "/api/search?q=a&page=1&limit=5", {
    scenarioId,
    endpoint: "/api/search",
  });
  return statusCheck(response, 400, scenarioId)
    && jsonCheck(response, "success", false, scenarioId)
    && jsonCheck(response, "error.code", "VALIDATION_ERROR", scenarioId)
    && jsonCheck(response, "error.message", "Request validation failed", scenarioId);
}

function recommendationSuccess() {
  const scenarioId = "recommendation-success";
  const response = request("GET", `/api/catalog/products/${NOTEBOOK_PRODUCT}/recommendations?limit=2`, {
    scenarioId,
    endpoint: "/api/catalog/products/:productId/recommendations",
  });
  return statusCheck(response, 200, scenarioId)
    && jsonCheck(response, "success", true, scenarioId);
}

function recommendationLimitValidation() {
  const scenarioId = "recommendation-limit-validation";
  const response = request("GET", `/api/catalog/products/${NOTEBOOK_PRODUCT}/recommendations?limit=5`, {
    scenarioId,
    endpoint: "/api/catalog/products/:productId/recommendations",
  });
  return statusCheck(response, 400, scenarioId)
    && jsonCheck(response, "error.code", "VALIDATION_ERROR", scenarioId)
    && jsonCheck(response, "error.message", "Request validation failed", scenarioId);
}

function buyerSuccessFunnel() {
  const scenarioId = "buyer-success-funnel";
  const productList = request("GET", "/api/catalog/products?page=1&limit=2", {
    scenarioId,
    endpoint: "/api/catalog/products",
  });
  const productDetail = request("GET", `/api/catalog/products/${NOTEBOOK_PRODUCT}`, {
    scenarioId,
    endpoint: "/api/catalog/products/:productId",
  });
  const recommendations = request("GET", `/api/catalog/products/${NOTEBOOK_PRODUCT}/recommendations?limit=2`, {
    scenarioId,
    endpoint: "/api/catalog/products/:productId/recommendations",
  });
  const cart = addCartItem(scenarioId, BUYER_ONE, NOTEBOOK_VARIANT);
  const cartItemId = jsonValue(cart.response, "data.cart.items.0.cart_item_id");
  const cartId = jsonValue(cart.response, "data.cart.cart_id");
  const cartUpdate = cartItemId ? updateCartItem(scenarioId, BUYER_ONE, cartItemId, 2) : { passed: false, response: null };
  const updatedCartId = cartUpdate.response ? jsonValue(cartUpdate.response, "data.cart.cart_id") : cartId;
  const order = updatedCartId ? createOrder(scenarioId, BUYER_ONE, updatedCartId, ADDRESS_ONE) : { passed: false, response: null };
  const orderId = order.response ? jsonValue(order.response, "data.order.order_id") : "";
  const payment = orderId ? createPayment(scenarioId, BUYER_ONE, orderId, "success", null) : { passed: false };
  const orderAfter = orderId ? getOrder(scenarioId, BUYER_ONE, orderId) : { passed: false, response: null };

  return statusCheck(productList, 200, `${scenarioId} product list`)
    && jsonCheck(productList, "data.items.0.product_id", NOTEBOOK_PRODUCT, `${scenarioId} product list`)
    && statusCheck(productDetail, 200, `${scenarioId} product detail`)
    && jsonCheck(productDetail, "data.product.product_id", NOTEBOOK_PRODUCT, `${scenarioId} product detail`)
    && statusCheck(recommendations, 200, `${scenarioId} recommendations`)
    && jsonCheck(recommendations, "success", true, `${scenarioId} recommendations`)
    && cart.passed
    && jsonCheck(cart.response, "success", true, `${scenarioId} cart add`)
    && jsonCheck(cart.response, "data.cart.customer_id", BUYER_ONE, `${scenarioId} cart add`)
    && cartUpdate.passed
    && jsonCheck(cartUpdate.response, "data.cart.items.0.quantity", 2, `${scenarioId} cart update`)
    && order.passed
    && jsonCheck(order.response, "data.order.status", "pending_payment", `${scenarioId} order`)
    && payment.passed
    && jsonCheck(payment.response, "data.attempt.status", "succeeded", `${scenarioId} payment`)
    && orderAfter.passed
    && jsonCheck(orderAfter.response, "data.order.status", "paid", `${scenarioId} order after`);
}

function buyerFailureFunnel() {
  const scenarioId = "buyer-failure-funnel";
  const search = request("GET", "/api/search?q=Notebook&page=1&limit=20", {
    scenarioId,
    endpoint: "/api/search",
  });
  const cart = addCartItem(scenarioId, BUYER_TWO, NOTEBOOK_VARIANT);
  const cartItemId = jsonValue(cart.response, "data.cart.items.0.cart_item_id");
  const cartId = jsonValue(cart.response, "data.cart.cart_id");
  const cartUpdate = cartItemId ? updateCartItem(scenarioId, BUYER_TWO, cartItemId, 2) : { passed: false, response: null };
  const updatedCartId = cartUpdate.response ? jsonValue(cartUpdate.response, "data.cart.cart_id") : cartId;
  const order = updatedCartId ? createOrder(scenarioId, BUYER_TWO, updatedCartId, ADDRESS_TWO) : { passed: false, response: null };
  const orderId = order.response ? jsonValue(order.response, "data.order.order_id") : "";
  const payment = orderId ? createPayment(scenarioId, BUYER_TWO, orderId, "fail", "CARD_DECLINED") : { passed: false, response: null };
  const orderAfter = orderId ? getOrder(scenarioId, BUYER_TWO, orderId) : { passed: false, response: null };

  return statusCheck(search, 200, `${scenarioId} search`)
    && jsonCheck(search, "data.items.0.product_id", NOTEBOOK_PRODUCT, `${scenarioId} search`)
    && cart.passed
    && jsonCheck(cart.response, "success", true, `${scenarioId} cart add`)
    && cartUpdate.passed
    && jsonCheck(cartUpdate.response, "data.cart.items.0.quantity", 2, `${scenarioId} cart update`)
    && order.passed
    && jsonCheck(order.response, "data.order.status", "pending_payment", `${scenarioId} order`)
    && payment.passed
    && jsonCheck(payment.response, "data.attempt.status", "failed", `${scenarioId} payment`)
    && orderAfter.passed
    && jsonCheck(orderAfter.response, "data.order.status", "payment_failed", `${scenarioId} order after`);
}

function buyerCartValidationFailure() {
  const scenarioId = "buyer-cart-validation-failure";
  const cart = getCart(scenarioId, BUYER_ONE);
  const invalidPatch = updateCartItem(scenarioId, BUYER_ONE, BUYER_ONE_ACTIVE_CART_ITEM, 0);
  return cart.passed
    && jsonCheck(cart.response, "data.cart.items.0.cart_item_id", BUYER_ONE_ACTIVE_CART_ITEM, `${scenarioId} cart`)
    && invalidPatch.passed
    && jsonCheck(invalidPatch.response, "error.code", "VALIDATION_ERROR", `${scenarioId} patch`)
    && jsonCheck(invalidPatch.response, "error.message", "Request validation failed", `${scenarioId} patch`);
}

function buyerCartAddDeleteRoundtrip() {
  const scenarioId = "buyer-cart-add-delete-roundtrip";
  const before = getCart(scenarioId, BUYER_TWO);
  const add = addCartItem(scenarioId, BUYER_TWO, MUG_VARIANT);
  const cartItemId = jsonValue(add.response, "data.cart.items.0.cart_item_id");
  const del = cartItemId ? deleteCartItem(scenarioId, BUYER_TWO, cartItemId) : { passed: false, response: null };
  return before.passed
    && jsonCheck(before.response, "data.cart.customer_id", BUYER_TWO, `${scenarioId} before`)
    && add.passed
    && jsonCheck(add.response, "success", true, `${scenarioId} add`)
    && jsonCheck(add.response, "data.cart.items.0.variant_id", MUG_VARIANT, `${scenarioId} add`)
    && del.passed
    && jsonCheck(del.response, "success", true, `${scenarioId} delete`)
    && jsonCheck(del.response, "data.cart.customer_id", BUYER_TWO, `${scenarioId} delete`);
}

function buyerEmptyCartCheckoutConflict() {
  const scenarioId = "buyer-empty-cart-checkout-conflict";
  const cart = getCart(scenarioId, BUYER_TWO);
  const cartId = jsonValue(cart.response, "data.cart.cart_id");
  const existingItemId = jsonValue(cart.response, "data.cart.items.0.cart_item_id");
  const cleanup = existingItemId ? deleteCartItem(scenarioId, BUYER_TWO, existingItemId) : { passed: true };
  const response = request("POST", "/api/orders", {
    scenarioId,
    endpoint: "/api/orders",
    headers: { "x-customer-id": BUYER_TWO },
    body: {
      cartId,
      addressId: ADDRESS_TWO,
    },
  });
  return cart.passed
    && jsonCheck(cart.response, "data.cart.customer_id", BUYER_TWO, `${scenarioId} cart`)
    && cleanup.passed
    && statusCheck(response, 409, scenarioId)
    && jsonCheck(response, "error.code", "STATE_CONFLICT", scenarioId);
}

function buyerPaymentValidationFailure() {
  const scenarioId = "buyer-payment-validation-failure";
  const response = request("POST", `/api/orders/${SEEDED_FAILURE_ORDER}/payment-attempts`, {
    scenarioId,
    endpoint: "/api/orders/:orderId/payment-attempts",
    headers: { "x-customer-id": BUYER_TWO },
    body: {
      requestKey: uniqueSuffix("k6-pay-validation"),
      outcome: "fail",
    },
  });
  return statusCheck(response, 400, scenarioId)
    && jsonCheck(response, "error.code", "VALIDATION_ERROR", scenarioId)
    && jsonCheck(response, "error.message", "Request validation failed", scenarioId);
}

function buyerCrossOrderAccessDenied() {
  const scenarioId = "buyer-cross-order-access-denied";
  const order = getOrder(scenarioId, BUYER_TWO, SEEDED_SUCCESS_ORDER, 404);
  return order.passed
    && jsonCheck(order.response, "error.code", "NOT_FOUND", scenarioId)
    && jsonCheck(order.response, "error.message", "Order not found", scenarioId);
}

function routeNotFound() {
  const scenarioId = "route-not-found";
  const response = request("GET", "/route-that-does-not-exist", {
    scenarioId,
    endpoint: "/route-that-does-not-exist",
  });
  return statusCheck(response, 404, scenarioId)
    && contentTypeIncludesCheck(response, "application/json", scenarioId)
    && jsonCheck(response, "error.code", "NOT_FOUND", scenarioId)
    && jsonCheck(response, "error.message", "Route not found", scenarioId);
}

function businessSuccessFunnel() {
  const scenarioId = "business-success-funnel";
  const customerId = exec.vu.idInTest % 2 === 0 ? BUYER_TWO : BUYER_ONE;
  const variantId = exec.vu.idInTest % 2 === 0 ? MUG_VARIANT : NOTEBOOK_VARIANT;
  const addressId = exec.vu.idInTest % 2 === 0 ? ADDRESS_TWO : ADDRESS_ONE;
  const searchPassed = searchNotebook(scenarioId);
  const cart = addCartItem(scenarioId, customerId, variantId);
  const cartId = jsonValue(cart.response, "data.cart.cart_id");
  const order = cartId ? createOrder(scenarioId, customerId, cartId, addressId) : { passed: false, response: null };
  const orderId = order.response ? jsonValue(order.response, "data.order.order_id") : "";
  const payment = orderId ? createPayment(scenarioId, customerId, orderId, "success", null) : { passed: false };
  return searchPassed && cart.passed && order.passed && payment.passed;
}

function buyerPaymentFailure() {
  const scenarioId = "buyer-payment-failure";
  const cart = addCartItem(scenarioId, BUYER_TWO, MUG_VARIANT);
  const cartId = jsonValue(cart.response, "data.cart.cart_id");
  const order = cartId ? createOrder(scenarioId, BUYER_TWO, cartId, ADDRESS_TWO) : { passed: false, response: null };
  const orderId = order.response ? jsonValue(order.response, "data.order.order_id") : "";
  const payment = orderId ? createPayment(scenarioId, BUYER_TWO, orderId, "fail", "CARD_DECLINED") : { passed: false };
  return cart.passed && order.passed && payment.passed;
}

function faultSearchDelay() {
  return searchNotebook("fault-search-delay", { "x-mwa-fault": "delay", "x-mwa-fault-delay-ms": "1000" });
}

function faultCartDelay() {
  return addCartItem("fault-cart-delay", BUYER_TWO, MUG_VARIANT, { "x-mwa-fault": "delay", "x-mwa-fault-delay-ms": "1000" }).passed;
}

function faultOrderDelay() {
  const scenarioId = "fault-order-delay";
  const cart = addCartItem(scenarioId, BUYER_TWO, MUG_VARIANT);
  const cartId = jsonValue(cart.response, "data.cart.cart_id");
  const order = cartId
    ? createOrder(scenarioId, BUYER_TWO, cartId, ADDRESS_TWO, { "x-mwa-fault": "delay", "x-mwa-fault-delay-ms": "1000" })
    : { passed: false };
  return cart.passed && order.passed;
}

function faultPaymentDelay() {
  const scenarioId = "fault-payment-delay";
  const cart = addCartItem(scenarioId, BUYER_TWO, MUG_VARIANT);
  const cartId = jsonValue(cart.response, "data.cart.cart_id");
  const order = cartId ? createOrder(scenarioId, BUYER_TWO, cartId, ADDRESS_TWO) : { passed: false, response: null };
  const orderId = order.response ? jsonValue(order.response, "data.order.order_id") : "";
  const payment = orderId
    ? createPayment(scenarioId, BUYER_TWO, orderId, "success", null, { "x-mwa-fault": "delay", "x-mwa-fault-delay-ms": "1000" })
    : { passed: false };
  return cart.passed && order.passed && payment.passed;
}

function faultSearchError() {
  return searchNotebook("fault-search-error", { "x-mwa-fault": "error" });
}

function faultUnhandledException() {
  return searchNotebook("fault-unhandled-exception", { "x-mwa-fault": "unhandled" });
}

function validation4xxBurst() {
  const search = request("GET", "/api/search?q=a&page=1&limit=5", {
    scenarioId: "validation-4xx-burst",
    endpoint: "/api/search",
  });
  const cart = request("POST", "/api/cart/items", {
    scenarioId: "validation-4xx-burst",
    endpoint: "/api/cart/items",
    headers: { "x-customer-id": BUYER_ONE },
    body: { variantId: NOTEBOOK_VARIANT, quantity: 0 },
  });
  const payment = request("POST", `/api/orders/${SEEDED_FAILURE_ORDER}/payment-attempts`, {
    scenarioId: "validation-4xx-burst",
    endpoint: "/api/orders/:orderId/payment-attempts",
    headers: { "x-customer-id": BUYER_TWO },
    body: { requestKey: uniqueSuffix("invalid-payment"), outcome: "fail" },
  });

  return statusCheck(search, 400, "validation search")
    && statusCheck(cart, 400, "validation cart")
    && statusCheck(payment, 400, "validation payment");
}

function paymentFailureTypes() {
  const scenarioId = "payment-failure-types";
  const cart = addCartItem(scenarioId, BUYER_TWO, MUG_VARIANT);
  const cartId = jsonValue(cart.response, "data.cart.cart_id");
  const order = cartId ? createOrder(scenarioId, BUYER_TWO, cartId, ADDRESS_TWO) : { passed: false, response: null };
  const orderId = order.response ? jsonValue(order.response, "data.order.order_id") : "";
  if (!orderId) {
    return false;
  }

  const declined = createPayment(scenarioId, BUYER_TWO, orderId, "fail", "CARD_DECLINED");
  const timeout = createPayment(scenarioId, BUYER_TWO, orderId, "fail", "PAYMENT_TIMEOUT");
  const internal = createPayment(scenarioId, BUYER_TWO, orderId, "fail", "PAYMENT_INTERNAL_ERROR");
  return cart.passed && order.passed && declined.passed && timeout.passed && internal.passed;
}

function labelCoverageMissingBuyer() {
  const response = request("POST", "/api/cart/items", {
    scenarioId: "label-coverage-missing-buyer",
    endpoint: "/api/cart/items",
    body: {
      variantId: NOTEBOOK_VARIANT,
      quantity: 1,
    },
  });
  return statusCheck(response, 401, "missing buyer label");
}

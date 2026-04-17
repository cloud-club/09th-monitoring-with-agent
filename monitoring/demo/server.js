const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const morgan = require("morgan");
const client = require("prom-client");
const { prisma, isPrismaEnabled } = require("./prisma-client");

const PORT = process.env.PORT || 8080;
const LOG_DIR = process.env.LOG_DIR || "/app/logs";
const LOG_ACCESS = path.join(LOG_DIR, "mwa-access.log");
const LOG_APP = path.join(LOG_DIR, "mwa-app.log");
const SCENARIO_BACKEND_BASE_URL = process.env.SCENARIO_BACKEND_BASE_URL || process.env.BACKEND_BASE_URL || "http://127.0.0.1:8080";

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
    description: "실제 404 HTML 응답을 실패 시나리오로 확인합니다.",
    mode: "sequential",
    steps: [
      {
        id: "missing-route",
        label: "GET /route-that-does-not-exist",
        method: "GET",
        path: "/route-that-does-not-exist",
        assertions: [
          { type: "status", equals: 404 },
          { type: "content_type_includes", value: "text/html" },
          { type: "text_includes", value: "Cannot GET /route-that-does-not-exist" },
        ],
      },
    ],
  },
];

const ALLOWED_SCENARIO_PATH_PATTERNS = [
  /^\/health$/,
  /^\/metrics$/,
  /^\/route-that-does-not-exist$/,
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
  const context = {
    runtime: {
      runId: crypto.randomUUID(),
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

function renderScenarioPage() {
  const templatesJson = escapeForInlineScript(SCENARIO_TEMPLATES);
  const defaultTemplateId = SCENARIO_TEMPLATES[0]?.id || "";

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scenario Testing Web</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
    :root {
      color-scheme: dark;
      --bg: #0f172a;
      --panel: #111827;
      --panel-2: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --green: #22c55e;
      --green-2: #16a34a;
      --red: #f87171;
      --amber: #facc15;
      --blue: #38bdf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'IBM Plex Sans', system-ui, sans-serif;
      background: radial-gradient(circle at top, #1e293b 0, #0f172a 48%);
      color: var(--text);
      padding: 24px;
    }
    a { color: var(--blue); }
    code, pre, textarea, .mono { font-family: 'JetBrains Mono', monospace; }
    .shell {
      max-width: 1440px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }
    .hero, .panel {
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 18px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
    }
    .hero {
      padding: 28px;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      align-items: end;
      justify-content: space-between;
    }
    .hero h1 {
      margin: 0 0 10px;
      font-size: clamp(30px, 5vw, 42px);
      line-height: 1.05;
    }
    .hero p {
      margin: 0;
      max-width: 760px;
      color: var(--muted);
      line-height: 1.6;
    }
    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(34, 197, 94, 0.35);
      background: rgba(34, 197, 94, 0.12);
      color: #dcfce7;
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 12px;
      letter-spacing: 0.02em;
    }
    .layout {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 20px;
    }
    .sidebar, .workspace {
      display: grid;
      gap: 20px;
    }
    .panel { padding: 18px; }
    .panel h2, .panel h3 { margin: 0 0 12px; }
    .panel p { margin: 0; color: var(--muted); }
    .template-list {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }
    .template-group {
      display: grid;
      gap: 12px;
    }
    .template-group + .template-group {
      margin-top: 12px;
      padding-top: 16px;
      border-top: 1px solid rgba(148, 163, 184, 0.12);
    }
    .template-group-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #cbd5e1;
    }
    .template-group-count {
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.02em;
    }
    .template-card {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(30, 41, 59, 0.55);
      color: var(--text);
      text-align: left;
      padding: 14px;
      cursor: pointer;
      transition: border-color 200ms ease, background-color 200ms ease, transform 200ms ease;
    }
    .template-card:hover,
    .template-card:focus-visible {
      border-color: rgba(56, 189, 248, 0.6);
      background: rgba(30, 41, 59, 0.88);
      transform: translateY(-1px);
      outline: none;
    }
    .template-card.is-active {
      border-color: rgba(34, 197, 94, 0.7);
      background: rgba(34, 197, 94, 0.14);
    }
    .template-card strong {
      display: block;
      margin-bottom: 6px;
      font-size: 15px;
    }
    .editor-toolbar, .result-toolbar {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }
    .button-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    button {
      border: none;
      border-radius: 12px;
      padding: 11px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 200ms ease, transform 200ms ease, opacity 200ms ease;
    }
    button:hover,
    button:focus-visible {
      transform: translateY(-1px);
      outline: none;
    }
    .button-primary { background: var(--green); color: #052e16; }
    .button-primary:hover, .button-primary:focus-visible { background: var(--green-2); color: white; }
    .button-secondary { background: rgba(51, 65, 85, 0.9); color: var(--text); }
    .button-secondary:hover, .button-secondary:focus-visible { background: rgba(71, 85, 105, 1); }
    .button-ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
    .button-ghost:hover, .button-ghost:focus-visible { background: rgba(51, 65, 85, 0.55); color: var(--text); }
    textarea {
      width: 100%;
      min-height: 420px;
      resize: vertical;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: #020617;
      color: var(--text);
      padding: 16px;
      font-size: 13px;
      line-height: 1.6;
    }
    .status-line {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
      margin-top: 14px;
      color: var(--muted);
      font-size: 13px;
    }
    .status-pill {
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-valid { background: rgba(34, 197, 94, 0.14); color: #bbf7d0; }
    .status-invalid { background: rgba(248, 113, 113, 0.14); color: #fecaca; }
    .status-running { background: rgba(250, 204, 21, 0.14); color: #fde68a; }
    .error-list {
      margin: 12px 0 0;
      padding-left: 18px;
      color: #fecaca;
      display: grid;
      gap: 6px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .summary-card {
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(30, 41, 59, 0.48);
      padding: 14px;
    }
    .summary-card strong {
      display: block;
      font-size: 24px;
      margin-top: 6px;
    }
    .result-list {
      display: grid;
      gap: 14px;
    }
    .result-card {
      border: 1px solid var(--border);
      border-radius: 16px;
      background: rgba(2, 6, 23, 0.72);
      overflow: hidden;
    }
    .result-head {
      padding: 16px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    }
    .result-pass { border-left: 4px solid var(--green); }
    .result-fail { border-left: 4px solid var(--red); }
    .result-meta {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 12px;
    }
    .result-body {
      padding: 16px;
      display: grid;
      gap: 14px;
    }
    pre {
      margin: 0;
      border-radius: 12px;
      border: 1px solid rgba(148, 163, 184, 0.16);
      background: #020617;
      color: #e2e8f0;
      padding: 14px;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      font-size: 12px;
      line-height: 1.55;
    }
    .assertion-list {
      display: grid;
      gap: 8px;
    }
    .assertion-item {
      border-radius: 12px;
      padding: 10px 12px;
      border: 1px solid rgba(148, 163, 184, 0.15);
      background: rgba(15, 23, 42, 0.75);
      font-size: 13px;
    }
    .assertion-item.pass { border-color: rgba(34, 197, 94, 0.4); }
    .assertion-item.fail { border-color: rgba(248, 113, 113, 0.4); }
    .muted { color: var(--muted); }
    .tiny { font-size: 12px; }
    @media (max-width: 980px) {
      body { padding: 16px; }
      .layout { grid-template-columns: 1fr; }
      .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 640px) {
      .hero, .panel { padding: 16px; }
      .summary-grid { grid-template-columns: 1fr; }
      textarea { min-height: 320px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; scroll-behavior: auto !important; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div>
        <h1>Scenario Testing Web</h1>
        <p>성공, 실패, 텍스트 메트릭 응답까지 같은 UI에서 실행하고 검증합니다. 이 화면은 demo host 위에 붙는 내부 QA 콘솔이며, 실제 backend API 계약을 직접 확인합니다.</p>
        <div class="hero-meta">
          <span class="chip mono">backend ${escapeHtml(SCENARIO_BACKEND_BASE_URL)}</span>
          <span class="chip">GET-only guardrails</span>
          <span class="chip">sequential / parallel</span>
        </div>
      </div>
      <div class="tiny muted">Run the demo host on a different port than the backend when both run locally.</div>
    </section>

    <section class="layout">
      <aside class="sidebar">
        <section class="panel">
          <h2>Scenario Library</h2>
          <p>실제 backend 계약을 바로 확인할 수 있는 최소 템플릿만 제공합니다.</p>
          <div id="template-list" class="template-list"></div>
        </section>
        <section class="panel">
          <h3>Guardrails</h3>
          <div class="assertion-list">
            <div class="assertion-item">허용 path: <span class="mono">/health</span>, <span class="mono">/metrics</span>, <span class="mono">/api/catalog/products*</span></div>
            <div class="assertion-item">허용 method: <span class="mono">GET / POST / PATCH / DELETE</span></div>
            <div class="assertion-item">지원 assertion: status, json_path, text_includes, content_type_includes</div>
            <div class="assertion-item">사용자 흐름은 <span class="mono">x-customer-id</span>, body, 이전 step 결과 참조를 사용할 수 있습니다.</div>
          </div>
        </section>
      </aside>

      <section class="workspace">
        <section class="panel">
          <div class="editor-toolbar">
            <div>
              <h2 style="margin-bottom:6px">Scenario Editor</h2>
              <p id="scenario-description">Template + JSON editing</p>
            </div>
            <div class="button-row">
              <button id="validate-button" class="button-secondary" type="button">Validate</button>
              <button id="reset-button" class="button-ghost" type="button">Reset</button>
              <button id="run-button" class="button-primary" type="button">Run scenario</button>
            </div>
          </div>
          <textarea id="scenario-editor" spellcheck="false" aria-label="Scenario JSON editor"></textarea>
          <div class="status-line">
            <span id="validation-pill" class="status-pill status-valid">Ready</span>
            <span class="mono tiny">POST /qa/scenarios/run</span>
          </div>
          <ul id="validation-errors" class="error-list" hidden></ul>
        </section>

        <section class="panel">
          <div class="result-toolbar">
            <div>
              <h2 style="margin-bottom:6px">Results</h2>
              <p>실행 결과와 assertion verdict를 step 단위로 확인합니다.</p>
            </div>
            <div id="run-status" class="status-pill status-valid">No run yet</div>
          </div>
          <div id="summary-grid" class="summary-grid" hidden></div>
          <div id="result-list" class="result-list">
            <div class="result-card">
              <div class="result-body muted">시나리오를 실행하면 결과가 여기에 표시됩니다.</div>
            </div>
          </div>
        </section>
      </section>
    </section>
  </main>

  <script>
    const templates = ${templatesJson};
    const defaultTemplateId = ${escapeForInlineScript(defaultTemplateId)};

    const templateList = document.getElementById('template-list');
    const editor = document.getElementById('scenario-editor');
    const scenarioDescription = document.getElementById('scenario-description');
    const validationPill = document.getElementById('validation-pill');
    const validationErrors = document.getElementById('validation-errors');
    const summaryGrid = document.getElementById('summary-grid');
    const resultList = document.getElementById('result-list');
    const runStatus = document.getElementById('run-status');
    const runButton = document.getElementById('run-button');
    const validateButton = document.getElementById('validate-button');
    const resetButton = document.getElementById('reset-button');

    let activeTemplateId = defaultTemplateId;

    function getTemplate(id) {
      return templates.find((template) => template.id === id) || templates[0];
    }

    function setValidationState(state, errors = []) {
      validationPill.className = 'status-pill ' + (state === 'valid' ? 'status-valid' : state === 'running' ? 'status-running' : 'status-invalid');
      validationPill.textContent = state === 'valid' ? 'Valid scenario' : state === 'running' ? 'Running...' : 'Validation failed';
      validationErrors.hidden = errors.length === 0;
      validationErrors.innerHTML = errors.map((error) => '<li>' + error.replace(/</g, '&lt;') + '</li>').join('');
    }

    function renderTemplates() {
      const groups = [
        {
          title: 'Buyer journey scenarios',
          matcher: (template) => template.id.startsWith('buyer-'),
        },
        {
          title: 'Backend API scenarios',
          matcher: (template) => !template.id.startsWith('buyer-') && template.path === undefined,
        },
      ];

      const buyerTemplates = templates.filter((template) => template.id.startsWith('buyer-'));
      const nonBuyerTemplates = templates.filter((template) => !template.id.startsWith('buyer-'));
      const backendTemplates = nonBuyerTemplates.filter((template) => template.id !== 'health-success' && template.id !== 'metrics-text-check' && template.id !== 'health-metrics-parallel' && template.id !== 'route-not-found');
      const coreTemplates = nonBuyerTemplates.filter((template) => !backendTemplates.includes(template));

      const renderGroup = (title, groupTemplates) => {
        if (groupTemplates.length === 0) {
          return '';
        }

        const cards = groupTemplates.map((template) => {
          const activeClass = template.id === activeTemplateId ? ' is-active' : '';
          return '<button class="template-card' + activeClass + '" type="button" data-template-id="' + template.id + '"><strong>' + template.name + '</strong><span class="muted tiny">' + template.description + '</span></button>';
        }).join('');

        return '<section class="template-group"><h3 class="template-group-title"><span>' + title + '</span><span class="template-group-count">' + groupTemplates.length + ' scenarios</span></h3>' + cards + '</section>';
      };

      templateList.innerHTML = [
        renderGroup('Buyer journey scenarios', buyerTemplates),
        renderGroup('Backend API scenarios', backendTemplates),
        renderGroup('Core checks', coreTemplates),
      ].join('');
    }

    function loadTemplate(id) {
      const template = structuredClone(getTemplate(id));
      activeTemplateId = template.id;
      scenarioDescription.textContent = template.description;
      editor.value = JSON.stringify(template, null, 2);
      renderTemplates();
      setValidationState('valid');
    }

    async function validateCurrentScenario() {
      let scenario;
      try {
        scenario = JSON.parse(editor.value);
      } catch (error) {
        setValidationState('invalid', ['JSON parse error: ' + error.message]);
        return null;
      }

      const response = await fetch('/qa/scenarios/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true, scenario }),
      });
      const payload = await response.json();
      if (!payload.success) {
        setValidationState('invalid', payload.errors || ['Validation failed']);
        return null;
      }

      setValidationState('valid');
      return scenario;
    }

    function renderSummary(summary, mode, backendBaseUrl) {
      summaryGrid.hidden = false;
      summaryGrid.innerHTML = [
        ['Mode', mode],
        ['Total steps', String(summary.totalSteps)],
        ['Passed', String(summary.passedSteps)],
        ['Failed', String(summary.failedSteps)],
      ].map(([label, value]) => '<article class="summary-card"><span class="muted tiny">' + label + '</span><strong>' + value + '</strong></article>').join('');
      runStatus.className = 'status-pill ' + (summary.passed ? 'status-valid' : 'status-invalid');
      runStatus.textContent = (summary.passed ? 'Passed' : 'Failed') + ' · ' + backendBaseUrl;
    }

    function renderResults(results) {
      resultList.innerHTML = results.map((result) => {
        const assertionMarkup = result.assertions.length === 0
          ? '<div class="assertion-item">No assertions executed</div>'
          : result.assertions.map((assertion) => {
              return '<div class="assertion-item ' + (assertion.passed ? 'pass' : 'fail') + '"><strong>' + (assertion.passed ? 'PASS' : 'FAIL') + '</strong> · ' + assertion.label + '<div class="tiny muted">expected: ' + JSON.stringify(assertion.expected) + ' · actual: ' + JSON.stringify(assertion.actual) + '</div></div>';
            }).join('');
        const errorMarkup = result.error ? '<div class="assertion-item fail"><strong>Execution error</strong><div class="tiny muted">' + result.error.replace(/</g, '&lt;') + '</div></div>' : '';
        const requestPreview = JSON.stringify({ headers: result.requestHeaders || {}, body: result.requestBody }, null, 2);
        return '<article class="result-card ' + (result.passed ? 'result-pass' : 'result-fail') + '"><div class="result-head"><div><strong>' + result.label + '</strong><div class="result-meta"><span class="mono">' + result.method + ' ' + result.path + '</span><span>' + (result.status === null ? 'NO RESPONSE' : 'status ' + result.status) + '</span><span>' + result.durationMs + 'ms</span><span>' + (result.contentType || 'n/a') + '</span></div></div><div class="status-pill ' + (result.passed ? 'status-valid' : 'status-invalid') + '">' + (result.passed ? 'PASS' : 'FAIL') + '</div></div><div class="result-body"><div><div class="tiny muted" style="margin-bottom:8px">Request</div><pre>' + requestPreview.replace(/</g, '&lt;') + '</pre></div><div><div class="tiny muted" style="margin-bottom:8px">Response preview</div><pre>' + (result.preview || '').replace(/</g, '&lt;') + '</pre></div>' + errorMarkup + '<div><div class="tiny muted" style="margin-bottom:8px">Assertions</div><div class="assertion-list">' + assertionMarkup + '</div></div></div></article>';
      }).join('');
    }

    templateList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-template-id]');
      if (!button) {
        return;
      }
      loadTemplate(button.getAttribute('data-template-id'));
    });

    validateButton.addEventListener('click', async () => {
      await validateCurrentScenario();
    });

    resetButton.addEventListener('click', () => {
      loadTemplate(activeTemplateId);
      summaryGrid.hidden = true;
      runStatus.className = 'status-pill status-valid';
      runStatus.textContent = 'No run yet';
      resultList.innerHTML = '<div class="result-card"><div class="result-body muted">시나리오를 실행하면 결과가 여기에 표시됩니다.</div></div>';
    });

    runButton.addEventListener('click', async () => {
      const scenario = await validateCurrentScenario();
      if (!scenario) {
        return;
      }

      setValidationState('running');
      runButton.disabled = true;
      runStatus.className = 'status-pill status-running';
      runStatus.textContent = 'Running';

      const response = await fetch('/qa/scenarios/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
      });
      const payload = await response.json();

      if (!payload.success) {
        setValidationState('invalid', payload.errors || ['Execution failed']);
        runStatus.className = 'status-pill status-invalid';
        runStatus.textContent = 'Execution blocked';
        runButton.disabled = false;
        return;
      }

      setValidationState('valid');
      renderSummary(payload.run.summary, payload.run.mode, payload.run.backendBaseUrl);
      renderResults(payload.run.results);
      runButton.disabled = false;
    });

    loadTemplate(defaultTemplateId);
  </script>
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

const app = express();
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

app.get("/qa/scenarios", (_req, res) => {
  res.type("html").send(renderScenarioPage());
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
  res.json({
    success: true,
    run,
  });
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

app.listen(PORT, "0.0.0.0", () => {
  const line = JSON.stringify({
    event: "server_start",
    port: PORT,
    catalog_skus: PRODUCTS.map((p) => p.id),
    ts: new Date().toISOString(),
  });
  console.log(line);
  appendLog(LOG_APP, line);
});

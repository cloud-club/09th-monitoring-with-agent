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

function appendLog(filePath, line) {
  const text = line.endsWith("\n") ? line : `${line}\n`;
  fs.appendFile(filePath, text, (err) => {
    if (err) console.error(`appendLog ${filePath}:`, err.message);
  });
}

function pickRandomProduct() {
  return PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
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

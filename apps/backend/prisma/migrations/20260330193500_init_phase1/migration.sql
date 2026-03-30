-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('started', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "href" TEXT,
    "referrer" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "mobile" TEXT,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "province" TEXT,
    "city" TEXT NOT NULL,
    "department" TEXT,
    "possession" TEXT,
    "zip_code" TEXT,
    "special_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "seller_customer_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshots" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_contents" (
    "id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "revert_policy" TEXT,

    CONSTRAINT "sale_snapshot_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_tags" (
    "id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "sale_snapshot_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_units" (
    "id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "primary" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "sale_snapshot_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_unit_options" (
    "id" UUID NOT NULL,
    "sale_snapshot_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "variable" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "sale_snapshot_unit_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_unit_option_candidates" (
    "id" UUID NOT NULL,
    "sale_snapshot_unit_option_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "sale_snapshot_unit_option_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_unit_stocks" (
    "id" UUID NOT NULL,
    "sale_snapshot_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nominal_price" DECIMAL(12,2) NOT NULL,
    "real_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "sale_snapshot_unit_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "actor_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,
    "volume" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item_stocks" (
    "id" UUID NOT NULL,
    "cart_item_id" UUID NOT NULL,
    "sale_snapshot_unit_id" UUID NOT NULL,
    "sale_snapshot_unit_stock_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "cart_item_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item_stock_choices" (
    "id" UUID NOT NULL,
    "cart_item_stock_id" UUID NOT NULL,
    "sale_snapshot_unit_option_id" UUID NOT NULL,
    "sale_snapshot_unit_option_candidate_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "cart_item_stock_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "address_id" UUID,
    "name" TEXT NOT NULL,
    "cash" DECIMAL(12,2) NOT NULL,
    "deposit" DECIMAL(12,2) NOT NULL,
    "mileage" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "cart_item_id" UUID NOT NULL,
    "seller_customer_id" UUID,
    "volume" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "address_id" UUID,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "failure_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_events" (
    "id" UUID NOT NULL,
    "event_name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "request_id" TEXT,
    "user_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_request_logs" (
    "id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "customer_id" UUID,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "latency_ms" INTEGER NOT NULL,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_records" (
    "id" UUID NOT NULL,
    "alert_name" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_ref" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "alert_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_seller_customer_id_idx" ON "sales"("seller_customer_id");

-- CreateIndex
CREATE INDEX "sale_snapshots_sale_id_idx" ON "sale_snapshots"("sale_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_contents_sale_snapshot_id_idx" ON "sale_snapshot_contents"("sale_snapshot_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_tags_sale_snapshot_id_idx" ON "sale_snapshot_tags"("sale_snapshot_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_units_sale_snapshot_id_idx" ON "sale_snapshot_units"("sale_snapshot_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_unit_options_sale_snapshot_unit_id_idx" ON "sale_snapshot_unit_options"("sale_snapshot_unit_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_unit_option_candidates_sale_snapshot_unit_opt_idx" ON "sale_snapshot_unit_option_candidates"("sale_snapshot_unit_option_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_unit_stocks_sale_snapshot_unit_id_idx" ON "sale_snapshot_unit_stocks"("sale_snapshot_unit_id");

-- CreateIndex
CREATE INDEX "carts_customer_id_idx" ON "carts"("customer_id");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");

-- CreateIndex
CREATE INDEX "cart_items_sale_snapshot_id_idx" ON "cart_items"("sale_snapshot_id");

-- CreateIndex
CREATE INDEX "cart_item_stocks_cart_item_id_idx" ON "cart_item_stocks"("cart_item_id");

-- CreateIndex
CREATE INDEX "cart_item_stocks_sale_snapshot_unit_id_idx" ON "cart_item_stocks"("sale_snapshot_unit_id");

-- CreateIndex
CREATE INDEX "cart_item_stocks_sale_snapshot_unit_stock_id_idx" ON "cart_item_stocks"("sale_snapshot_unit_stock_id");

-- CreateIndex
CREATE INDEX "cart_item_stock_choices_cart_item_stock_id_idx" ON "cart_item_stock_choices"("cart_item_stock_id");

-- CreateIndex
CREATE INDEX "cart_item_stock_choices_sale_snapshot_unit_option_id_idx" ON "cart_item_stock_choices"("sale_snapshot_unit_option_id");

-- CreateIndex
CREATE INDEX "cart_item_stock_choices_sale_snapshot_unit_option_candidate_idx" ON "cart_item_stock_choices"("sale_snapshot_unit_option_candidate_id");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_address_id_idx" ON "orders"("address_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_cart_item_id_key" ON "order_items"("cart_item_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_cart_item_id_idx" ON "order_items"("cart_item_id");

-- CreateIndex
CREATE INDEX "order_items_seller_customer_id_idx" ON "order_items"("seller_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_payments_order_id_key" ON "order_payments"("order_id");

-- CreateIndex
CREATE INDEX "order_payments_address_id_idx" ON "order_payments"("address_id");

-- CreateIndex
CREATE INDEX "payment_attempts_order_id_idx" ON "payment_attempts"("order_id");

-- CreateIndex
CREATE INDEX "payment_attempts_status_idx" ON "payment_attempts"("status");

-- CreateIndex
CREATE INDEX "monitoring_events_event_name_idx" ON "monitoring_events"("event_name");

-- CreateIndex
CREATE INDEX "monitoring_events_entity_type_entity_id_idx" ON "monitoring_events"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "monitoring_events_request_id_idx" ON "monitoring_events"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_request_logs_request_id_key" ON "api_request_logs"("request_id");

-- CreateIndex
CREATE INDEX "api_request_logs_customer_id_idx" ON "api_request_logs"("customer_id");

-- CreateIndex
CREATE INDEX "api_request_logs_method_endpoint_idx" ON "api_request_logs"("method", "endpoint");

-- CreateIndex
CREATE INDEX "api_request_logs_status_code_idx" ON "api_request_logs"("status_code");

-- CreateIndex
CREATE INDEX "alert_records_severity_status_idx" ON "alert_records"("severity", "status");

-- CreateIndex
CREATE INDEX "alert_records_source_type_source_ref_idx" ON "alert_records"("source_type", "source_ref");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_customer_id_fkey" FOREIGN KEY ("seller_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshots" ADD CONSTRAINT "sale_snapshots_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_contents" ADD CONSTRAINT "sale_snapshot_contents_sale_snapshot_id_fkey" FOREIGN KEY ("sale_snapshot_id") REFERENCES "sale_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_tags" ADD CONSTRAINT "sale_snapshot_tags_sale_snapshot_id_fkey" FOREIGN KEY ("sale_snapshot_id") REFERENCES "sale_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_units" ADD CONSTRAINT "sale_snapshot_units_sale_snapshot_id_fkey" FOREIGN KEY ("sale_snapshot_id") REFERENCES "sale_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_unit_options" ADD CONSTRAINT "sale_snapshot_unit_options_sale_snapshot_unit_id_fkey" FOREIGN KEY ("sale_snapshot_unit_id") REFERENCES "sale_snapshot_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_unit_option_candidates" ADD CONSTRAINT "sale_snapshot_unit_option_candidates_sale_snapshot_unit_op_fkey" FOREIGN KEY ("sale_snapshot_unit_option_id") REFERENCES "sale_snapshot_unit_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_unit_stocks" ADD CONSTRAINT "sale_snapshot_unit_stocks_sale_snapshot_unit_id_fkey" FOREIGN KEY ("sale_snapshot_unit_id") REFERENCES "sale_snapshot_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_sale_snapshot_id_fkey" FOREIGN KEY ("sale_snapshot_id") REFERENCES "sale_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_stocks" ADD CONSTRAINT "cart_item_stocks_cart_item_id_fkey" FOREIGN KEY ("cart_item_id") REFERENCES "cart_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_stocks" ADD CONSTRAINT "cart_item_stocks_sale_snapshot_unit_id_fkey" FOREIGN KEY ("sale_snapshot_unit_id") REFERENCES "sale_snapshot_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_stocks" ADD CONSTRAINT "cart_item_stocks_sale_snapshot_unit_stock_id_fkey" FOREIGN KEY ("sale_snapshot_unit_stock_id") REFERENCES "sale_snapshot_unit_stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_stock_choices" ADD CONSTRAINT "cart_item_stock_choices_cart_item_stock_id_fkey" FOREIGN KEY ("cart_item_stock_id") REFERENCES "cart_item_stocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_stock_choices" ADD CONSTRAINT "cart_item_stock_choices_sale_snapshot_unit_option_id_fkey" FOREIGN KEY ("sale_snapshot_unit_option_id") REFERENCES "sale_snapshot_unit_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_item_stock_choices" ADD CONSTRAINT "cart_item_stock_choices_sale_snapshot_unit_option_candidat_fkey" FOREIGN KEY ("sale_snapshot_unit_option_candidate_id") REFERENCES "sale_snapshot_unit_option_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_cart_item_id_fkey" FOREIGN KEY ("cart_item_id") REFERENCES "cart_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seller_customer_id_fkey" FOREIGN KEY ("seller_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;


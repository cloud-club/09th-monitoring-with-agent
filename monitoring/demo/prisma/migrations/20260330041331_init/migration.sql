-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_snapshots" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "format" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "article_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_comments" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "article_comment_snapshots" (
    "id" UUID NOT NULL,
    "article_comment_id" UUID NOT NULL,
    "format" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "article_comment_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_categories" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "parent_id" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "channel_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citizens" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "mobile" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "citizens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "nickname" TEXT NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_users" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "application" TEXT NOT NULL,
    "uid" TEXT NOT NULL,

    CONSTRAINT "external_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "external_user_id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sellers" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,

    CONSTRAINT "sellers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "administrators" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,

    CONSTRAINT "administrators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "seller_customer_id" UUID NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshots" (
    "id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,

    CONSTRAINT "sale_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_categories" (
    "id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,
    "channel_category_id" UUID NOT NULL,

    CONSTRAINT "sale_snapshot_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_contents" (
    "id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "sale_snapshot_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_tags" (
    "id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "sale_snapshot_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_units" (
    "id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "sale_snapshot_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_unit_options" (
    "id" UUID NOT NULL,
    "sale_snapshot_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "sale_snapshot_unit_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_unit_option_candidates" (
    "id" UUID NOT NULL,
    "sale_snapshot_unit_option_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "sale_snapshot_unit_option_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_unit_stocks" (
    "id" UUID NOT NULL,
    "sale_snapshot_unit_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "real_price" DECIMAL(12,2) NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sale_snapshot_unit_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "actor_type" TEXT NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,
    "volume" INTEGER NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item_stocks" (
    "id" UUID NOT NULL,
    "cart_item_id" UUID NOT NULL,
    "sale_snapshot_unit_id" UUID NOT NULL,
    "sale_snapshot_unit_stock_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "cart_item_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_item_stock_choices" (
    "id" UUID NOT NULL,
    "cart_item_stock_id" UUID NOT NULL,
    "sale_snapshot_unit_option_id" UUID NOT NULL,
    "sale_snapshot_unit_option_candidate_id" UUID NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "cart_item_stock_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "cash" DECIMAL(12,2) NOT NULL,
    "deposit" DECIMAL(12,2) NOT NULL,
    "mileage" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "cart_item_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "volume" INTEGER NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_payments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "failure_code" TEXT,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_tickets" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "expired_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupon_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_ticket_payments" (
    "id" UUID NOT NULL,
    "coupon_ticket_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,

    CONSTRAINT "coupon_ticket_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "direction" INTEGER NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_histories" (
    "id" UUID NOT NULL,
    "deposit_id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "deposit_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mileages" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "direction" INTEGER NOT NULL,

    CONSTRAINT "mileages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mileage_histories" (
    "id" UUID NOT NULL,
    "mileage_id" UUID NOT NULL,
    "citizen_id" UUID NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "mileage_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_inquiries" (
    "id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "sale_snapshot_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_questions" (
    "id" UUID NOT NULL,
    "sale_snapshot_inquiry_id" UUID NOT NULL,
    "secret" BOOLEAN NOT NULL,

    CONSTRAINT "sale_snapshot_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_reviews" (
    "id" UUID NOT NULL,
    "sale_snapshot_inquiry_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,

    CONSTRAINT "sale_snapshot_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_inquiry_answers" (
    "id" UUID NOT NULL,
    "sale_snapshot_inquiry_id" UUID NOT NULL,
    "seller_customer_id" UUID NOT NULL,

    CONSTRAINT "sale_snapshot_inquiry_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_favorites" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "sale_snapshot_id" UUID NOT NULL,

    CONSTRAINT "sale_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_snapshot_inquiry_favorites" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "sale_snapshot_inquiry_id" UUID NOT NULL,
    "article_snapshot_id" UUID NOT NULL,

    CONSTRAINT "sale_snapshot_inquiry_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "address_favorites" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "address_id" UUID NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "address_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_events" (
    "id" UUID NOT NULL,
    "event_name" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "request_id" TEXT,
    "user_id" TEXT NOT NULL,

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

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_records" (
    "id" UUID NOT NULL,
    "alert_name" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_ref" TEXT NOT NULL,

    CONSTRAINT "alert_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "article_snapshots_article_id_idx" ON "article_snapshots"("article_id");

-- CreateIndex
CREATE INDEX "article_comments_article_id_idx" ON "article_comments"("article_id");

-- CreateIndex
CREATE INDEX "article_comments_parent_id_idx" ON "article_comments"("parent_id");

-- CreateIndex
CREATE INDEX "article_comment_snapshots_article_comment_id_idx" ON "article_comment_snapshots"("article_comment_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_code_key" ON "channels"("code");

-- CreateIndex
CREATE INDEX "channel_categories_channel_id_idx" ON "channel_categories"("channel_id");

-- CreateIndex
CREATE INDEX "channel_categories_parent_id_idx" ON "channel_categories"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_code_key" ON "sections"("code");

-- CreateIndex
CREATE INDEX "citizens_channel_id_idx" ON "citizens"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_citizen_id_key" ON "members"("citizen_id");

-- CreateIndex
CREATE INDEX "members_channel_id_idx" ON "members"("channel_id");

-- CreateIndex
CREATE INDEX "external_users_channel_id_idx" ON "external_users"("channel_id");

-- CreateIndex
CREATE INDEX "external_users_citizen_id_idx" ON "external_users"("citizen_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_users_channel_id_uid_key" ON "external_users"("channel_id", "uid");

-- CreateIndex
CREATE UNIQUE INDEX "customers_member_id_key" ON "customers"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_external_user_id_key" ON "customers"("external_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_citizen_id_key" ON "customers"("citizen_id");

-- CreateIndex
CREATE INDEX "customers_channel_id_idx" ON "customers"("channel_id");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_member_id_key" ON "sellers"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "administrators_member_id_key" ON "administrators"("member_id");

-- CreateIndex
CREATE INDEX "sales_section_id_idx" ON "sales"("section_id");

-- CreateIndex
CREATE INDEX "sales_seller_customer_id_idx" ON "sales"("seller_customer_id");

-- CreateIndex
CREATE INDEX "sale_snapshots_sale_id_idx" ON "sale_snapshots"("sale_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_categories_sale_snapshot_id_idx" ON "sale_snapshot_categories"("sale_snapshot_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_categories_channel_category_id_idx" ON "sale_snapshot_categories"("channel_category_id");

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
CREATE INDEX "order_items_seller_id_idx" ON "order_items"("seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_payments_order_id_key" ON "order_payments"("order_id");

-- CreateIndex
CREATE INDEX "order_payments_address_id_idx" ON "order_payments"("address_id");

-- CreateIndex
CREATE INDEX "payment_attempts_order_id_idx" ON "payment_attempts"("order_id");

-- CreateIndex
CREATE INDEX "payment_attempts_status_idx" ON "payment_attempts"("status");

-- CreateIndex
CREATE INDEX "coupons_customer_id_idx" ON "coupons"("customer_id");

-- CreateIndex
CREATE INDEX "coupon_tickets_customer_id_idx" ON "coupon_tickets"("customer_id");

-- CreateIndex
CREATE INDEX "coupon_tickets_coupon_id_idx" ON "coupon_tickets"("coupon_id");

-- CreateIndex
CREATE INDEX "coupon_ticket_payments_coupon_ticket_id_idx" ON "coupon_ticket_payments"("coupon_ticket_id");

-- CreateIndex
CREATE INDEX "coupon_ticket_payments_order_id_idx" ON "coupon_ticket_payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_code_key" ON "deposits"("code");

-- CreateIndex
CREATE INDEX "deposit_histories_deposit_id_idx" ON "deposit_histories"("deposit_id");

-- CreateIndex
CREATE INDEX "deposit_histories_citizen_id_idx" ON "deposit_histories"("citizen_id");

-- CreateIndex
CREATE UNIQUE INDEX "mileages_code_key" ON "mileages"("code");

-- CreateIndex
CREATE INDEX "mileage_histories_mileage_id_idx" ON "mileage_histories"("mileage_id");

-- CreateIndex
CREATE INDEX "mileage_histories_citizen_id_idx" ON "mileage_histories"("citizen_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_inquiries_sale_snapshot_id_idx" ON "sale_snapshot_inquiries"("sale_snapshot_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_inquiries_customer_id_idx" ON "sale_snapshot_inquiries"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_snapshot_questions_sale_snapshot_inquiry_id_key" ON "sale_snapshot_questions"("sale_snapshot_inquiry_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_snapshot_reviews_sale_snapshot_inquiry_id_key" ON "sale_snapshot_reviews"("sale_snapshot_inquiry_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_snapshot_reviews_order_item_id_key" ON "sale_snapshot_reviews"("order_item_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_inquiry_answers_sale_snapshot_inquiry_id_idx" ON "sale_snapshot_inquiry_answers"("sale_snapshot_inquiry_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_inquiry_answers_seller_customer_id_idx" ON "sale_snapshot_inquiry_answers"("seller_customer_id");

-- CreateIndex
CREATE INDEX "sale_favorites_customer_id_idx" ON "sale_favorites"("customer_id");

-- CreateIndex
CREATE INDEX "sale_favorites_sale_id_idx" ON "sale_favorites"("sale_id");

-- CreateIndex
CREATE INDEX "sale_favorites_sale_snapshot_id_idx" ON "sale_favorites"("sale_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_favorites_customer_id_sale_id_sale_snapshot_id_key" ON "sale_favorites"("customer_id", "sale_id", "sale_snapshot_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_inquiry_favorites_customer_id_idx" ON "sale_snapshot_inquiry_favorites"("customer_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_inquiry_favorites_sale_snapshot_inquiry_id_idx" ON "sale_snapshot_inquiry_favorites"("sale_snapshot_inquiry_id");

-- CreateIndex
CREATE INDEX "sale_snapshot_inquiry_favorites_article_snapshot_id_idx" ON "sale_snapshot_inquiry_favorites"("article_snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_snapshot_inquiry_favorites_customer_id_sale_snapshot_i_key" ON "sale_snapshot_inquiry_favorites"("customer_id", "sale_snapshot_inquiry_id", "article_snapshot_id");

-- CreateIndex
CREATE INDEX "address_favorites_customer_id_idx" ON "address_favorites"("customer_id");

-- CreateIndex
CREATE INDEX "address_favorites_address_id_idx" ON "address_favorites"("address_id");

-- CreateIndex
CREATE UNIQUE INDEX "address_favorites_customer_id_address_id_key" ON "address_favorites"("customer_id", "address_id");

-- CreateIndex
CREATE INDEX "monitoring_events_request_id_idx" ON "monitoring_events"("request_id");

-- CreateIndex
CREATE INDEX "monitoring_events_entity_type_entity_id_idx" ON "monitoring_events"("entity_type", "entity_id");

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

-- AddForeignKey
ALTER TABLE "article_snapshots" ADD CONSTRAINT "article_snapshots_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_comments" ADD CONSTRAINT "article_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "article_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_comment_snapshots" ADD CONSTRAINT "article_comment_snapshots_article_comment_id_fkey" FOREIGN KEY ("article_comment_id") REFERENCES "article_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_categories" ADD CONSTRAINT "channel_categories_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_categories" ADD CONSTRAINT "channel_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "channel_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "citizens" ADD CONSTRAINT "citizens_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_users" ADD CONSTRAINT "external_users_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_users" ADD CONSTRAINT "external_users_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_external_user_id_fkey" FOREIGN KEY ("external_user_id") REFERENCES "external_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "administrators" ADD CONSTRAINT "administrators_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_seller_customer_id_fkey" FOREIGN KEY ("seller_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshots" ADD CONSTRAINT "sale_snapshots_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_categories" ADD CONSTRAINT "sale_snapshot_categories_sale_snapshot_id_fkey" FOREIGN KEY ("sale_snapshot_id") REFERENCES "sale_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_categories" ADD CONSTRAINT "sale_snapshot_categories_channel_category_id_fkey" FOREIGN KEY ("channel_category_id") REFERENCES "channel_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_cart_item_id_fkey" FOREIGN KEY ("cart_item_id") REFERENCES "cart_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_tickets" ADD CONSTRAINT "coupon_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_tickets" ADD CONSTRAINT "coupon_tickets_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_ticket_payments" ADD CONSTRAINT "coupon_ticket_payments_coupon_ticket_id_fkey" FOREIGN KEY ("coupon_ticket_id") REFERENCES "coupon_tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_ticket_payments" ADD CONSTRAINT "coupon_ticket_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_histories" ADD CONSTRAINT "deposit_histories_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_histories" ADD CONSTRAINT "deposit_histories_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mileage_histories" ADD CONSTRAINT "mileage_histories_mileage_id_fkey" FOREIGN KEY ("mileage_id") REFERENCES "mileages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mileage_histories" ADD CONSTRAINT "mileage_histories_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_inquiries" ADD CONSTRAINT "sale_snapshot_inquiries_sale_snapshot_id_fkey" FOREIGN KEY ("sale_snapshot_id") REFERENCES "sale_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_inquiries" ADD CONSTRAINT "sale_snapshot_inquiries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_questions" ADD CONSTRAINT "sale_snapshot_questions_sale_snapshot_inquiry_id_fkey" FOREIGN KEY ("sale_snapshot_inquiry_id") REFERENCES "sale_snapshot_inquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_reviews" ADD CONSTRAINT "sale_snapshot_reviews_sale_snapshot_inquiry_id_fkey" FOREIGN KEY ("sale_snapshot_inquiry_id") REFERENCES "sale_snapshot_inquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_reviews" ADD CONSTRAINT "sale_snapshot_reviews_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_inquiry_answers" ADD CONSTRAINT "sale_snapshot_inquiry_answers_sale_snapshot_inquiry_id_fkey" FOREIGN KEY ("sale_snapshot_inquiry_id") REFERENCES "sale_snapshot_inquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_inquiry_answers" ADD CONSTRAINT "sale_snapshot_inquiry_answers_seller_customer_id_fkey" FOREIGN KEY ("seller_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_favorites" ADD CONSTRAINT "sale_favorites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_favorites" ADD CONSTRAINT "sale_favorites_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_favorites" ADD CONSTRAINT "sale_favorites_sale_snapshot_id_fkey" FOREIGN KEY ("sale_snapshot_id") REFERENCES "sale_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_inquiry_favorites" ADD CONSTRAINT "sale_snapshot_inquiry_favorites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_inquiry_favorites" ADD CONSTRAINT "sale_snapshot_inquiry_favorites_sale_snapshot_inquiry_id_fkey" FOREIGN KEY ("sale_snapshot_inquiry_id") REFERENCES "sale_snapshot_inquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_snapshot_inquiry_favorites" ADD CONSTRAINT "sale_snapshot_inquiry_favorites_article_snapshot_id_fkey" FOREIGN KEY ("article_snapshot_id") REFERENCES "article_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_favorites" ADD CONSTRAINT "address_favorites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address_favorites" ADD CONSTRAINT "address_favorites_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_events" ADD CONSTRAINT "monitoring_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "api_request_logs"("request_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

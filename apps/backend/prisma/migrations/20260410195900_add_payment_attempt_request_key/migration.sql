ALTER TABLE "payment_attempts"
ADD COLUMN "request_key" TEXT;

UPDATE "payment_attempts"
SET "request_key" = 'legacy-' || replace("id"::text, '-', '');

ALTER TABLE "payment_attempts"
ALTER COLUMN "request_key" SET NOT NULL;

CREATE UNIQUE INDEX "payment_attempts_order_id_request_key_key"
ON "payment_attempts" ("order_id", "request_key");

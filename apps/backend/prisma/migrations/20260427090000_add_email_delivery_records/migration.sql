CREATE TABLE "email_delivery_records" (
    "id" UUID NOT NULL,
    "incident_id" TEXT NOT NULL,
    "incident_type" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "subject" TEXT,
    "recipients" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "failure_reason" TEXT,
    "dedup_suppressed" BOOLEAN NOT NULL DEFAULT false,
    "llm_used" BOOLEAN NOT NULL DEFAULT false,
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "email_delivery_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_delivery_records_fingerprint_dedup_key_idx" ON "email_delivery_records"("fingerprint", "dedup_key");
CREATE INDEX "email_delivery_records_incident_id_idx" ON "email_delivery_records"("incident_id");
CREATE INDEX "email_delivery_records_status_idx" ON "email_delivery_records"("status");
CREATE INDEX "email_delivery_records_created_at_idx" ON "email_delivery_records"("created_at");

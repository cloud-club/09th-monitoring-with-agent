-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_citizen_id_fkey";

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_external_user_id_fkey";

-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_member_id_fkey";

-- DropIndex
DROP INDEX "customers_citizen_id_key";

-- DropIndex
DROP INDEX "customers_external_user_id_key";

-- DropIndex
DROP INDEX "customers_member_id_key";

-- DropIndex
DROP INDEX "members_citizen_id_key";

-- AlterTable
ALTER TABLE "customers" ALTER COLUMN "member_id" DROP NOT NULL,
ALTER COLUMN "external_user_id" DROP NOT NULL,
ALTER COLUMN "citizen_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "customers_member_id_idx" ON "customers"("member_id");

-- CreateIndex
CREATE INDEX "customers_external_user_id_idx" ON "customers"("external_user_id");

-- CreateIndex
CREATE INDEX "customers_citizen_id_idx" ON "customers"("citizen_id");

-- CreateIndex
CREATE INDEX "members_citizen_id_idx" ON "members"("citizen_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_external_user_id_fkey" FOREIGN KEY ("external_user_id") REFERENCES "external_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_citizen_id_fkey" FOREIGN KEY ("citizen_id") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

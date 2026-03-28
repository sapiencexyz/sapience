-- DropIndex
DROP INDEX IF EXISTS "IDX_credit_session_expires_at";

-- AlterTable
ALTER TABLE "credit_session" DROP COLUMN IF EXISTS "expiresAt";

-- RenameTable
ALTER TABLE "render_job" RENAME TO "background_job";

-- Replace columns: drop old ones, add new ones
ALTER TABLE "background_job" DROP COLUMN "jobId";
ALTER TABLE "background_job" DROP COLUMN "serviceId";
ALTER TABLE "background_job" ADD COLUMN "command" VARCHAR NOT NULL DEFAULT '';
ALTER TABLE "background_job" ADD COLUMN "status" VARCHAR NOT NULL DEFAULT 'pending';
ALTER TABLE "background_job" ADD COLUMN "params" VARCHAR;

-- Remove defaults after backfilling existing rows
ALTER TABLE "background_job" ALTER COLUMN "command" DROP DEFAULT;
ALTER TABLE "background_job" ALTER COLUMN "status" DROP DEFAULT;

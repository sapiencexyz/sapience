-- Add tags column to condition table
ALTER TABLE "condition" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';

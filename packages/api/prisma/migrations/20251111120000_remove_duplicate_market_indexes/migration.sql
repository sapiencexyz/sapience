-- Drop duplicate unique constraint on market table
ALTER TABLE "market" DROP CONSTRAINT IF EXISTS "UQ_6e25995aba1162dc315f8214ee7";

-- Drop duplicate indexes on market table
DROP INDEX IF EXISTS "IDX_bf8c48db94805b3077cfe30fa6";
DROP INDEX IF EXISTS "IDX_f89ec06faf22da268399ae6a9b";


-- Drop crypto_prices table if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crypto_prices'
  ) THEN
    EXECUTE 'DROP TABLE IF EXISTS "crypto_prices" CASCADE';
  END IF;
END $$;



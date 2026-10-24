-- Migration 003: Cleanup orphaned explanation cache rows
-- Remove old cache entries with malformed cache keys like '3333:openai'

DO $$
BEGIN
  -- Delete explanations where model_name looks like a cache key (contains colon)
  DELETE FROM explanations WHERE model_name LIKE '%:%';
  
  RAISE NOTICE 'Cleaned up orphaned explanation cache rows';
END $$;

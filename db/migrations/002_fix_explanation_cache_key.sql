-- Migration 002: Fix explanation cache key to include provider and model
-- Phase 6 bug: duplicate key error when re-explaining same pool with different model

DO $$
BEGIN
  -- Add provider column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'explanations' AND column_name = 'provider'
  ) THEN
    -- Add column without default first
    ALTER TABLE explanations ADD COLUMN provider VARCHAR(50);
    
    -- Set provider based on model_name for existing rows
    UPDATE explanations 
    SET provider = CASE
      WHEN model_name LIKE 'gpt-%' OR model_name LIKE 'openai/%' THEN 'openai'
      WHEN model_name LIKE '%groq%' THEN 'groq'
      WHEN model_name = 'mock-v1' THEN 'mock'
      ELSE 'openai'
    END
    WHERE provider IS NULL;
    
    -- Now make it NOT NULL with default for new rows
    ALTER TABLE explanations ALTER COLUMN provider SET NOT NULL;
    ALTER TABLE explanations ALTER COLUMN provider SET DEFAULT 'openai';
  END IF;

  -- Create index if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_explanations_provider_model'
  ) THEN
    CREATE INDEX idx_explanations_provider_model ON explanations(provider, model_name);
  END IF;

  -- Drop old unique constraint if exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'explanations_unique_per_risk'
  ) THEN
    ALTER TABLE explanations DROP CONSTRAINT explanations_unique_per_risk;
  END IF;

  -- Add new unique constraint if not exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'explanations_unique_per_risk_provider_model'
  ) THEN
    ALTER TABLE explanations 
    ADD CONSTRAINT explanations_unique_per_risk_provider_model 
    UNIQUE (risk_score_id, provider, model_name);
  END IF;
END $$;

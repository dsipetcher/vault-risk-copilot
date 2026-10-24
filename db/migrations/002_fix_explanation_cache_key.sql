-- Migration: Fix explanation cache key to include provider and model
-- Phase 6 bug: duplicate key error when re-explaining same pool with different model

-- Add provider column if not exists
ALTER TABLE explanations 
ADD COLUMN IF NOT EXISTS provider VARCHAR(50) NOT NULL DEFAULT 'openai';

-- Update model_name to be non-null and add index
CREATE INDEX IF NOT EXISTS idx_explanations_provider_model ON explanations(provider, model_name);

-- Drop old unique constraint
ALTER TABLE explanations DROP CONSTRAINT IF EXISTS explanations_unique_per_risk;

-- Add new unique constraint: one explanation per risk_score + provider + model
ALTER TABLE explanations 
ADD CONSTRAINT explanations_unique_per_risk_provider_model 
UNIQUE (risk_score_id, provider, model_name);

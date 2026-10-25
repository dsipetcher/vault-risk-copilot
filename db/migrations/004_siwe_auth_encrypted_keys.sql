-- Migration 004: Sign-In With Ethereum (SIWE) authentication and encrypted LLM credentials
-- Adds tables for sessions, nonces, and server-side encrypted LLM API keys

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Sessions table: stores authenticated user sessions (opaque session IDs)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Wallet address (checksummed, normalized to lowercase internally for queries)
    wallet_address VARCHAR(42) NOT NULL,
    
    -- Session metadata
    session_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- SIWE message metadata (for audit/debugging)
    chain_id INTEGER NOT NULL,
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    CONSTRAINT sessions_valid_address CHECK (wallet_address ~ '^0x[a-fA-F0-9]{40}$')
);

CREATE INDEX IF NOT EXISTS idx_sessions_wallet_address ON sessions(LOWER(wallet_address));
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Nonces table: single-use nonces for SIWE authentication with short TTL
CREATE TABLE IF NOT EXISTS nonces (
    nonce VARCHAR(255) PRIMARY KEY,
    
    -- Metadata for replay protection
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    used_at TIMESTAMP WITH TIME ZONE,
    
    -- Optional: track which wallet requested this nonce (not required by EIP-4361)
    requested_by_ip VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_nonces_expires_at ON nonces(expires_at);
CREATE INDEX IF NOT EXISTS idx_nonces_used ON nonces(used) WHERE used = false;

-- LLM credentials table: encrypted LLM API keys per wallet address and provider
CREATE TABLE IF NOT EXISTS llm_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Wallet address (checksummed, normalized to lowercase internally for queries)
    -- Additional Authenticated Data (AAD) binding: wallet_address + provider
    wallet_address VARCHAR(42) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    
    -- AES-256-GCM encrypted key components
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,                    -- 12-byte initialization vector (base64)
    auth_tag TEXT NOT NULL,              -- 16-byte authentication tag (base64)
    key_version INTEGER NOT NULL DEFAULT 1,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT llm_credentials_valid_address CHECK (wallet_address ~ '^0x[a-fA-F0-9]{40}$'),
    CONSTRAINT llm_credentials_unique_wallet_provider UNIQUE (wallet_address, provider)
);

CREATE INDEX IF NOT EXISTS idx_llm_credentials_wallet ON llm_credentials(LOWER(wallet_address));
CREATE INDEX IF NOT EXISTS idx_llm_credentials_provider ON llm_credentials(provider);

-- Comments
COMMENT ON TABLE sessions IS 'Authenticated SIWE sessions with opaque session tokens stored in httpOnly cookies';
COMMENT ON TABLE nonces IS 'Single-use nonces for SIWE message signing with short TTL and replay protection';
COMMENT ON TABLE llm_credentials IS 'AES-256-GCM encrypted LLM API keys per wallet address and provider';

COMMENT ON COLUMN llm_credentials.ciphertext IS 'Encrypted API key using AES-256-GCM with master key from LLM_KEY_ENCRYPTION_KEY env var';
COMMENT ON COLUMN llm_credentials.iv IS 'Random 12-byte initialization vector (base64 encoded)';
COMMENT ON COLUMN llm_credentials.auth_tag IS '16-byte GCM authentication tag (base64 encoded)';
COMMENT ON COLUMN llm_credentials.key_version IS 'Key version for future rotation support';

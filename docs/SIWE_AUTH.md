# SIWE Authentication and Encrypted Key Storage

## Overview

Phase 7 introduces **Sign-In With Ethereum (EIP-4361)** authentication and **server-side encrypted LLM API key storage** to Vault Risk Copilot.

## Features

### 1. Sign-In With Ethereum (SIWE)

Users can authenticate using their Ethereum wallet:

- **Connect Wallet**: Click "Connect Wallet" to connect MetaMask or any injected provider
- **Sign Message**: Click "Sign In With Ethereum" to sign a SIWE message
- **Session Management**: Authenticated sessions persist for 7 days with httpOnly, Secure (in production), SameSite=Lax cookies

### 2. Server-Side Encrypted LLM Key Storage

Authenticated users can save their LLM API keys encrypted on the server:

- **AES-256-GCM Encryption**: Keys are encrypted with a master key from the environment
- **Per-Wallet Storage**: Each wallet address can store keys for multiple LLM providers
- **Automatic Usage**: When signed in, stored keys are used automatically (no need to provide via header)
- **Browser Fallback**: Anonymous users can still use the browser-only mode with `X-LLM-Api-Key` header

## API Endpoints

### Authentication

#### `GET /api/auth/nonce`

Generate a single-use nonce for SIWE message signing.

**Response:**
```json
{
  "nonce": "a1b2c3d4e5f6..."
}
```

#### `POST /api/auth/verify`

Verify a SIWE message and create a session.

**Request Body:**
```json
{
  "message": "localhost wants you to sign in with...",
  "signature": "0xabc123..."
}
```

**Response:**
```json
{
  "success": true,
  "address": "0x1234567890123456789012345678901234567890"
}
```

**Sets Cookie:** `vault_session` (httpOnly, Secure in prod, SameSite=Lax, 7 days)

#### `GET /api/auth/me`

Get the current authenticated user.

**Response (authenticated):**
```json
{
  "authenticated": true,
  "address": "0x1234567890123456789012345678901234567890",
  "chainId": 1
}
```

**Response (not authenticated):** `401 Unauthorized`

#### `POST /api/auth/logout`

Sign out and delete the session.

**Response:**
```json
{
  "success": true
}
```

### LLM Credentials

#### `PUT /api/llm-credentials`

Save an encrypted LLM API key (requires authentication).

**Request Body:**
```json
{
  "provider": "openai",
  "apiKey": "sk-..."
}
```

**Response:**
```json
{
  "success": true,
  "provider": "openai"
}
```

#### `GET /api/llm-credentials`

Get metadata for stored credentials (requires authentication).

**Response:**
```json
{
  "credentials": [
    {
      "provider": "openai",
      "maskedKey": "****xyz1",
      "createdAt": "2026-10-25T12:00:00Z",
      "updatedAt": "2026-10-25T12:00:00Z"
    }
  ]
}
```

**Note:** Plaintext API keys are **never** returned.

#### `DELETE /api/llm-credentials?provider=openai`

Delete a stored credential (requires authentication).

**Response:**
```json
{
  "success": true
}
```

### Explanation Endpoint (Updated)

The `POST /api/pools/:id/explain` endpoint now supports stored credentials:

**Precedence:**
1. If `X-LLM-Api-Key` header is provided → use it (anonymous mode)
2. If authenticated and stored key exists for provider → use stored key
3. Otherwise → use mock provider or fail

## Security Model

### What the Server Can Do

- ✅ Decrypt and use your LLM API keys (when you request an explanation)
- ✅ Verify wallet ownership via SIWE signature
- ✅ Store encrypted keys bound to your wallet address
- ✅ Prevent other users from accessing your keys

### What the Server Cannot Do

- ❌ Access keys without the master encryption key
- ❌ Decrypt keys for one wallet using another wallet's authentication
- ❌ Modify keys without detection (authenticated encryption with GCM)
- ❌ Sign transactions or access your wallet funds (authentication is signature-only)

### Threat Model

**Protected Against:**
- Database compromise (keys are encrypted at rest)
- Other users stealing your keys (per-wallet AAD binding)
- Replay attacks (single-use nonces, session tokens)
- Domain spoofing (SIWE domain validation)
- Session hijacking (httpOnly cookies, SameSite protection)
- Tampering with ciphertext (GCM authentication tags)

**NOT Protected Against:**
- Compromised server with access to master key (server can decrypt your keys)
- Malicious admin with database + master key access
- Client-side attacks (phishing, compromised browser)
- Network MITM if TLS is compromised

**Recommendation:** Use server-side storage for convenience, but understand the trade-offs. For maximum security, use browser-only mode (existing `X-LLM-Api-Key` header) or self-host the application.

## Environment Variables

### Server (.env)

```bash
# Required for server-side key storage
# Generate with: openssl rand -base64 32
LLM_KEY_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
```

**Important:**
- Keep this key **secret** and **secure**
- Anyone with this key can decrypt all stored LLM API keys
- Store it in a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)
- Rotate periodically (requires re-encryption migration)

### CI/CD

In CI, generate a test key:

```bash
export LLM_KEY_ENCRYPTION_KEY=$(openssl rand -base64 32)
```

Tests use the mock LLM provider, so no real API keys are needed.

## Database Schema

### Migration 004: SIWE Auth and Encrypted Keys

**Tables:**

#### `sessions`
- `id` (UUID): Primary key
- `wallet_address` (VARCHAR(42)): Ethereum address (checksummed)
- `session_token` (TEXT): Opaque session ID (stored in httpOnly cookie)
- `expires_at` (TIMESTAMP): Session expiration (7 days)
- `chain_id` (INTEGER): Chain ID from SIWE message
- `issued_at` (TIMESTAMP): SIWE message issuedAt
- `created_at`, `last_used_at` (TIMESTAMP)

#### `nonces`
- `nonce` (VARCHAR(255)): Primary key, single-use nonce
- `created_at`, `expires_at` (TIMESTAMP): TTL of 5 minutes
- `used` (BOOLEAN): Prevents replay attacks
- `used_at` (TIMESTAMP)
- `requested_by_ip` (VARCHAR(45)): Optional IP tracking

#### `llm_credentials`
- `id` (UUID): Primary key
- `wallet_address` (VARCHAR(42)): Ethereum address (checksummed)
- `provider` (VARCHAR(50)): LLM provider (openai, anthropic, etc.)
- `ciphertext` (TEXT): AES-256-GCM encrypted API key
- `iv` (TEXT): 12-byte initialization vector (base64)
- `auth_tag` (TEXT): 16-byte GCM authentication tag (base64)
- `key_version` (INTEGER): For future key rotation
- `created_at`, `updated_at` (TIMESTAMP)
- **Unique constraint:** `(wallet_address, provider)`

## Key Rotation Plan

When rotating the master encryption key:

1. **Add new key version:**
   ```sql
   ALTER TABLE llm_credentials ADD COLUMN new_ciphertext TEXT;
   ALTER TABLE llm_credentials ADD COLUMN new_iv TEXT;
   ALTER TABLE llm_credentials ADD COLUMN new_auth_tag TEXT;
   ```

2. **Re-encrypt all records:**
   - Fetch all credentials (server must have both old and new master keys)
   - Decrypt with old key, re-encrypt with new key
   - Update records with `key_version = 2`

3. **Drop old columns:**
   ```sql
   ALTER TABLE llm_credentials RENAME COLUMN new_ciphertext TO ciphertext;
   -- etc.
   ```

4. **Remove old master key from environment**

**Note:** During rotation, the server must have both keys available.

## Testing

### Unit Tests

#### Encryption (`packages/api/src/lib/encryption.test.ts`)
- ✅ Encrypt/decrypt round-trip
- ✅ Random IVs (different ciphertext for same plaintext)
- ✅ AAD binding (wallet address + provider)
- ✅ Tamper detection (modified ciphertext, IV, or auth tag fails)
- ✅ Key version mismatch rejection
- ✅ Wrong master key fails decryption

#### SIWE Auth (`packages/api/src/routes/auth.test.ts`)
- ✅ Nonce generation
- ✅ Valid SIWE message verification
- ✅ Domain mismatch rejection
- ✅ Bad signature rejection
- ✅ Expired message rejection
- ✅ Nonce reuse rejection (replay protection)
- ✅ Session cookie creation
- ✅ GET /auth/me returns user info
- ✅ Logout clears session

#### LLM Credentials (`packages/api/src/routes/llm-credentials.test.ts`)
- ✅ Save encrypted API key (authenticated)
- ✅ Update existing credential
- ✅ GET never returns plaintext key
- ✅ Authorization (wallet cannot read/delete other wallet's keys)
- ✅ Integration: stored key used in explain endpoint
- ✅ DELETE credential

### Migration Tests

#### Fresh Database
- ✅ Migration 004 creates all tables and indexes
- ✅ Constraints validated (valid Ethereum address format)

#### Upgrade Path (from current main schema)
- ✅ Run migrations on database with 001-003 already applied
- ✅ Verify no conflicts or duplicate constraints

## Usage Example (Web)

```tsx
import { useAuth } from '@/hooks/useAuth';
import { AuthButton } from '@/components/AuthButton';

function MyComponent() {
  const { user, isAuthenticated, signIn, signOut } = useAuth();

  return (
    <div>
      <AuthButton />
      {isAuthenticated && (
        <p>Welcome, {user.address}!</p>
      )}
    </div>
  );
}
```

## Known Limitations

1. **Master Key Security**: The server can decrypt keys. Self-host or use browser-only mode for maximum security.
2. **No Key Rotation UI**: Key rotation requires manual migration script.
3. **Single Chain Support**: Session stores one chain ID (from SIWE message), multi-chain support not implemented.
4. **No Session Revocation UI**: Sessions expire after 7 days, but no "logout from all devices" feature.
5. **IP Tracking Optional**: Nonces track requesting IP but are not enforced (for local development flexibility).

## Future Improvements

- [ ] Multi-chain session support (switch chains without re-authentication)
- [ ] Session management UI (list active sessions, revoke remotely)
- [ ] Key rotation UI and automated re-encryption
- [ ] Server-side key export (encrypted backup for user)
- [ ] Audit log for key access (who accessed which keys and when)
- [ ] Support for hardware wallets (Ledger, Trezor)

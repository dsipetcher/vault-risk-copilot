#!/bin/bash
set -euo pipefail

# Database migration runner for Vault Risk Copilot
# Creates schema_migrations table and runs pending migrations

DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/vault_risk}"

echo "=== Running Database Migrations ==="
echo "Database: $DB_URL"

# Create schema_migrations table if not exists
psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR(255) NOT NULL
);
SQL

echo "✓ Schema migrations table ready"

# Baseline check: if schema exists but no migrations recorded, verify 002 objects
# Note: 001 is idempotent, so we always run it (never baseline)
# Only baseline 002 if its objects actually exist
RECORDED_COUNT=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -tAc "SELECT COUNT(*) FROM schema_migrations" 2>/dev/null || echo "0")
RECORDED_COUNT=$(echo "$RECORDED_COUNT" | tr -d '[:space:]')

if [ "$RECORDED_COUNT" = "0" ]; then
  # Check if 002 objects exist (provider column and unique constraint)
  HAS_002=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -tAc "
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'explanations' AND column_name = 'provider'
    ) AND EXISTS (
      SELECT FROM pg_constraint 
      WHERE conname = 'explanations_unique_per_risk_provider_model'
    );
  " 2>/dev/null || echo "f")
  HAS_002=$(echo "$HAS_002" | tr -d '[:space:]')
  
  if [ "$HAS_002" = "t" ]; then
    echo "⚠ Detected existing schema with provider column (upgrade path)"
    # Record 002 as baseline (001 will run below since it's idempotent)
    psql "$DB_URL" -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, '002_fix_explanation_cache_key', NOW());"
    echo "✓ Recorded baseline: 002_fix_explanation_cache_key (objects verified)"
  fi
fi

# Detect migrations directory (local or copied to /tmp)
MIGRATIONS_DIR="${MIGRATIONS_DIR:-db/migrations}"
if [ ! -d "$MIGRATIONS_DIR" ] && [ -d "/tmp/migrations" ]; then
  MIGRATIONS_DIR="/tmp/migrations"
fi

# Run each migration in order
for migration_file in "$MIGRATIONS_DIR"/*.sql; do
  # Skip if no migrations found
  if [ ! -f "$migration_file" ]; then
    continue
  fi
  
  # Extract version number from filename (e.g., 001_initial_schema.sql -> 001)
  version=$(basename "$migration_file" | sed -n 's/^\([0-9]\{1,\}\).*/\1/p')
  name=$(basename "$migration_file" .sql)
  
  # Check if already applied
  already_applied=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -tAc "SELECT COUNT(*) FROM schema_migrations WHERE version = $version")
  
  if [ "$already_applied" -eq "0" ]; then
    echo "→ Applying migration $name..."
    
    # Check if migration contains transaction control statements (outside $$ blocks)
    # PL/pgSQL blocks (DO $$ ... $$) are allowed
    # Reject: BEGIN;/COMMIT;/ROLLBACK;/START TRANSACTION/BEGIN TRANSACTION
    for keyword in "BEGIN" "COMMIT" "ROLLBACK"; do
      if awk -v kw="$keyword" 'BEGIN{IGNORECASE=1} $0 ~ "^[[:space:]]*" kw "[[:space:]]*;" {found=1; exit} END{exit !found}' "$migration_file"; then
        echo "✗ Migration $name contains $keyword; statement"
        echo "  Migrations should not include transaction control (runner wraps them)"
        echo "  Note: PL/pgSQL blocks (DO \$\$ BEGIN ... END \$\$) are allowed"
        exit 1
      fi
    done
    if grep -iE '(START[[:space:]]+TRANSACTION|BEGIN[[:space:]]+TRANSACTION)' "$migration_file" > /dev/null; then
      echo "✗ Migration $name contains START/BEGIN TRANSACTION"
      echo "  Migrations should not include transaction control (runner wraps them)"
      exit 1
    fi
    
    # Run migration and record in one transaction
    # We wrap the migration file content with BEGIN/INSERT/COMMIT
    (
      echo "BEGIN;"
      cat "$migration_file"
      echo "INSERT INTO schema_migrations (version, name) VALUES ($version, '$name');"
      echo "COMMIT;"
    ) | psql "$DB_URL" -v ON_ERROR_STOP=1
    
    echo "✓ Migration $name applied"
  else
    echo "⊘ Migration $name already applied (skipping)"
  fi
done

echo "=== All migrations up to date ==="

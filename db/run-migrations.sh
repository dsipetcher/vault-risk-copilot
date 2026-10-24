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

# Baseline check: if schema exists but no migrations recorded, record already-applied ones
RECORDED_COUNT=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -tAc "SELECT COUNT(*) FROM schema_migrations")
TABLE_EXISTS=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pool_snapshots')")

if [ "$RECORDED_COUNT" -eq "0" ] && [ "$TABLE_EXISTS" = "t" ]; then
  echo "⚠ Detected existing schema with no recorded migrations (upgrade path)"
  # Record 001 and 002 as baseline (they were applied by old initdb or docker-entrypoint)
  psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
INSERT INTO schema_migrations (version, name, applied_at) VALUES (1, '001_initial_schema', NOW());
INSERT INTO schema_migrations (version, name, applied_at) VALUES (2, '002_fix_explanation_cache_key', NOW());
SQL
  echo "✓ Recorded baseline migrations (001, 002)"
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
    
    # Check if migration contains its own BEGIN/COMMIT
    if grep -qi "^\s*BEGIN" "$migration_file" || grep -qi "^\s*COMMIT" "$migration_file"; then
      echo "✗ Migration $name contains BEGIN/COMMIT statements"
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
    
    if [ $? -ne 0 ]; then
      echo "✗ Migration $name FAILED"
      exit 1
    fi
    
    echo "✓ Migration $name applied"
  else
    echo "⊘ Migration $name already applied (skipping)"
  fi
done

echo "=== All migrations up to date ==="

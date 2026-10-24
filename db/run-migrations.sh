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
  version=$(basename "$migration_file" | grep -oP '^\d+')
  name=$(basename "$migration_file" .sql)
  
  # Check if already applied
  already_applied=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -tAc "SELECT COUNT(*) FROM schema_migrations WHERE version = $version")
  
  if [ "$already_applied" -eq "0" ]; then
    echo "→ Applying migration $name..."
    
    # Run migration and record in one transaction
    psql "$DB_URL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
\i $migration_file
INSERT INTO schema_migrations (version, name) VALUES ($version, '$name');
COMMIT;
SQL
    
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

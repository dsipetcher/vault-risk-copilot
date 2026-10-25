# Database Migrations

## Migration Runner

The project uses `db/run-migrations.sh` to apply database schema changes with version tracking.

### Usage

**Local development:**
```bash
cd /workspace
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vault_risk" ./db/run-migrations.sh
```

**Docker Compose:**
Migrations are automatically applied on postgres container startup via `/docker-entrypoint-initdb.d/`.

**CI (E2E tests):**
```bash
docker cp db/migrations postgres-e2e:/tmp/migrations
docker cp db/run-migrations.sh postgres-e2e:/tmp/run-migrations.sh
docker exec postgres-e2e bash -c "DATABASE_URL='...' bash /tmp/run-migrations.sh"
```

### Migration Files

Place SQL files in `db/migrations/` with format: `NNN_description.sql`

Example:
- `001_initial_schema.sql`
- `002_fix_explanation_cache_key.sql`

### Schema Migrations Table

The runner creates a `schema_migrations` table to track applied versions:

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR(255) NOT NULL
);
```

Each migration runs once (idempotent).

### Seed Data

**E2E tests:** `db/e2e-seed.sql` (deterministic fixtures)

**Note:** e2e-seed.sql does NOT inline migration SQL. Always run `run-migrations.sh` first.

# Phase 2 Report: Data Layer Implementation

**Date:** October 24, 2026  
**Branch:** `cursor/phase-2-data-layer-c9c1`  
**Status:** ✅ Implemented and tested

---

## Что было реализовано

### 1. PostgreSQL Database Schema

**Файл:** `db/migrations/001_initial_schema.sql`

Созданы 4 основные таблицы:

#### `pool_snapshots`
Хранит временные снимки данных DeFi-пулов из DeFiLlama API и on-chain чтений.

**Ключевые поля:**
- `pool_id`, `protocol`, `chain`, `pool_name` - идентификация пула
- `tvl_usd`, `tvl_change_7d_pct` - TVL (Total Value Locked) и динамика
- `apy`, `apy_base`, `apy_reward` - доходность (базовая и через rewards)
- `apy_sigma`, `il_risk` - волатильность и impermanent loss риск
- `is_stablecoin` - флаг стейблкоина
- `data_source` - источник данных ('defillama' или 'onchain')
- `snapshot_at` - временная метка снимка

**Индексы:** По `pool_id`, `snapshot_at`, `protocol+chain`, `tvl_usd`

#### `risk_scores`
Хранит вычисленные риск-метрики для каждого pool snapshot.

**Ключевые поля:**
- `pool_id`, `snapshot_id` - связь с pool_snapshots
- `tvl_score`, `apy_volatility_score`, `reward_ratio_score`, `il_score` и др. - компонентные скоры (объяснимые признаки)
- `total_risk_score` (0-100) - общий риск
- `risk_category` - 'low', 'medium', 'high', 'critical'
- `is_anomaly`, `anomaly_reason` - детекция аномалий
- `model_version` - версия модели для воспроизводимости

**Индексы:** По `pool_id`, `total_risk_score`, `calculated_at`, `is_anomaly`

#### `explanations`
Хранит LLM-сгенерированные объяснения рисков на естественном языке.

**Ключевые поля:**
- `risk_score_id` - связь с risk_scores
- `explanation_text` - текст объяснения
- `risk_factors` (JSONB) - структурированные факторы (валидированы zod схемой)
- `model_name`, `prompt_tokens`, `latency_ms`, `cost_usd` - метрики LLM
- `validation_errors` - ошибки валидации схемы

**Индексы:** По `pool_id`, `generated_at`, `model_name`

#### `vault_state_snapshots`
Хранит on-chain состояние SimpleVault контракта на Sepolia.

**Ключевые поля:**
- `vault_address`, `chain` - идентификация контракта
- `total_assets`, `total_supply` - ERC-4626 состояние (numeric(78,0) для uint256)
- `share_price` - цена одного share (totalAssets / totalSupply)
- `deposit_cap`, `is_paused`, `owner_address` - конфигурация
- `utilization_pct` - процент использования cap
- `block_number`, `block_timestamp` - блокчейн метаданные

**Индексы:** По `vault_address`, `snapshot_at`, `block_number`

---

### 2. Docker Compose

**Файл:** `docker-compose.yml`

Конфигурация для всех сервисов:

1. **postgres** - PostgreSQL 16 Alpine
   - Порт: 5432
   - Автоматическое применение миграций при старте (`/docker-entrypoint-initdb.d`)
   - Healthcheck для зависимостей других сервисов

2. **collector** - TypeScript сервис сбора данных
   - Порт: не экспонирован (внутренний сервис)
   - Зависит от postgres
   - Периодический сбор по расписанию

3. **risk-service** - Python FastAPI (заглушка для Phase 3)
   - Порт: 8000

4. **api** - Node.js Fastify API (заглушка для Phase 4)
   - Порт: 3000

5. **web** - React + Vite фронтенд (заглушка для Phase 4)
   - Порт: 5173

6. **mcp** - MCP сервер TypeScript (заглушка для Phase 5)
   - Порт: 3001

**Сеть:** `vault-network` (bridge driver)  
**Volumes:** `postgres_data` для персистентности

---

### 3. TypeScript Collector Service

**Директория:** `packages/collector/`

#### Архитектура

```
src/
├── index.ts          # Точка входа, cron scheduler
├── config.ts         # Zod-валидация конфигурации из env
├── db.ts             # Postgres клиент и типы
├── defillama.ts      # Интеграция с DeFiLlama Yields API
├── vault-reader.ts   # On-chain чтение через viem
└── config.test.ts    # Unit-тесты конфигурации
```

#### Зависимости

- **viem 2.57.11** - современный TypeScript-native клиент для Ethereum (альтернатива ethers.js)
- **postgres 3.4.5** - легковесный Postgres клиент с typed-SQL
- **zod 4.6.7** - валидация схем и типов
- **node-cron 3.0.3** - планировщик задач
- **pino 9.5.0** - структурированное логирование
- **tsx 4.19.2** - TypeScript executor для разработки
- **vitest 2.1.8** - современный test runner

#### Функциональность

**1. DeFiLlama Integration (`defillama.ts`)**

```typescript
fetchDefiLlamaPools(apiUrl, logger) -> PoolSnapshot[]
```

- Запрос к `https://yields.llama.fi/pools`
- Zod-валидация ответа API
- **Фильтры:**
  - TVL ≥ $100,000
  - APY 0-1000%
  - Chains: Ethereum, Arbitrum, Optimism, Polygon, Base
  - Protocols: Aave, Compound, Uniswap, Curve, Lido, MakerDAO
  - Топ 100 после фильтрации
- Трансформация в `PoolSnapshot` с маппингом полей
- Обработка `ilRisk` ('yes'/'no' → 1.0/0.0)

**2. Vault On-chain Reader (`vault-reader.ts`)**

```typescript
class VaultReader {
  readVaultState() -> VaultStateSnapshot
}
```

- Использует **viem** для чтения Sepolia testnet
- Читает SimpleVault контракт (ERC-4626):
  - `totalAssets()`
  - `totalSupply()`
  - `depositCap()`
  - `paused()`
  - `owner()`
- Вычисляет производные метрики:
  - `share_price = totalAssets / totalSupply`
  - `utilization_pct = (totalAssets / depositCap) * 100`
- Получает метаданные блока (block_number, block_timestamp)

**3. Database Client (`db.ts`)**

```typescript
insertPoolSnapshot(sql, snapshot) -> Promise<void>
insertVaultStateSnapshot(sql, snapshot) -> Promise<void>
```

- **Идемпотентность:** `ON CONFLICT ... DO NOTHING`
- Serialization bigint → string для Postgres numeric типов
- Typed interfaces для всех таблиц

**4. Configuration (`config.ts`)**

```typescript
loadConfig() -> Config
```

- Zod-схема для всех environment variables
- Строгая валидация типов (URL, Ethereum address regex, числа)
- Defaults для опциональных полей
- Ясные сообщения об ошибках валидации

**5. Main Loop (`index.ts`)**

```typescript
collectData() {
  1. Fetch DeFiLlama pools
  2. Insert pool snapshots (batch)
  3. Read vault state (if configured)
  4. Insert vault snapshot
}
```

- **Cron schedule:** Каждые `COLLECTION_INTERVAL_MS` (по умолчанию 5 минут)
- Graceful shutdown на SIGINT/SIGTERM
- Structured logging с pino-pretty в dev mode

#### Тесты

**Файл:** `src/config.test.ts`

- ✅ 5/5 тестов проходят
- Покрытие: валидация конфигурации, defaults, ошибки

**Запуск:**
```bash
npm test         # Vitest run
npm run typecheck # TypeScript check
npm run build    # Compile to dist/
```

---

### 4. CI/CD Updates

**Файл:** `.github/workflows/ci.yml`

Добавлены новые jobs:

#### **collector** job
- Setup Node.js 22
- Install dependencies
- Typecheck
- Run tests
- Build

#### **docker** job
- Build Docker image для collector
- Проверка работоспособности Dockerfile
- Использование GitHub cache для слоёв

---

### 5. Environment Variables

**Обновлен:** `.env.example`

Новые переменные:

```bash
# Database
DATABASE_URL=postgresql://vault_user:vault_pass_local@localhost:5432/vault_risk_copilot
POSTGRES_USER=vault_user
POSTGRES_PASSWORD=vault_pass_local
POSTGRES_DB=vault_risk_copilot
POSTGRES_PORT=5432

# Blockchain (для collector)
RPC_URL=https://rpc.sepolia.org
MAINNET_RPC_URL=https://eth.llamarpc.com
VAULT_ADDRESS=0x...

# Collector
COLLECTION_INTERVAL_MS=300000
LOG_LEVEL=info

# External APIs
DEFILLAMA_API_URL=https://yields.llama.fi

# Service Ports
API_PORT=3000
RISK_SERVICE_PORT=8000
WEB_PORT=5173
MCP_PORT=3001

# CORS
CORS_ORIGIN=http://localhost:5173
```

---

## Тестирование

### Unit Tests

```bash
cd packages/collector
npm test
```

**Результаты:**
```
✓ src/config.test.ts (5 tests) 7ms

Test Files  1 passed (1)
     Tests  5 passed (5)
```

### Type Check

```bash
npm run typecheck
```

**Результат:** ✅ Без ошибок

### Build

```bash
npm run build
```

**Результат:** ✅ Успешная компиляция в `dist/`

---

## Как запустить локально

### Вариант 1: Docker Compose (полный стек)

```bash
# Создать .env из примера
cp .env.example .env

# Заполнить VAULT_ADDRESS, RPC_URL в .env

# Запустить все сервисы
docker compose up
```

**Сервисы будут доступны:**
- Postgres: `localhost:5432`
- API: `http://localhost:3000`
- Risk Service: `http://localhost:8000`
- Web: `http://localhost:5173`
- MCP: `http://localhost:3001`

### Вариант 2: Только collector (для разработки)

```bash
# Установить зависимости
cd packages/collector
npm install

# Запустить Postgres отдельно
docker run -d \
  -p 5432:5432 \
  -e POSTGRES_USER=vault_user \
  -e POSTGRES_PASSWORD=vault_pass_local \
  -e POSTGRES_DB=vault_risk_copilot \
  postgres:16-alpine

# Применить миграции
psql $DATABASE_URL -f ../../db/migrations/001_initial_schema.sql

# Установить переменные окружения
export DATABASE_URL="postgresql://vault_user:vault_pass_local@localhost:5432/vault_risk_copilot"
export DEFILLAMA_API_URL="https://yields.llama.fi"
export COLLECTION_INTERVAL_MS=60000

# Опционально для vault state:
export RPC_URL="https://rpc.sepolia.org"
export VAULT_ADDRESS="0x..."

# Запустить в dev режиме
npm run dev
```

**Логи покажут:**
```
[09:50:00.000] INFO: Vault Risk Collector starting
[09:50:00.100] INFO: Fetching DeFiLlama pools
[09:50:02.500] INFO: Fetched DeFiLlama pools, count: 100
[09:50:03.200] INFO: Pool snapshots inserted
[09:50:03.500] INFO: Reading vault state
[09:50:05.000] INFO: Vault state snapshot inserted
[09:50:05.100] INFO: Data collection cycle completed
```

---

## Проверка данных в Postgres

```sql
-- Подключение
psql postgresql://vault_user:vault_pass_local@localhost:5432/vault_risk_copilot

-- Проверка pool_snapshots
SELECT pool_id, protocol, chain, tvl_usd, apy, snapshot_at
FROM pool_snapshots
ORDER BY snapshot_at DESC
LIMIT 10;

-- Проверка vault_state_snapshots
SELECT vault_address, total_assets, total_supply, share_price, block_number, snapshot_at
FROM vault_state_snapshots
ORDER BY snapshot_at DESC
LIMIT 5;

-- Статистика по протоколам
SELECT protocol, COUNT(*) as snapshots, AVG(tvl_usd) as avg_tvl, AVG(apy) as avg_apy
FROM pool_snapshots
GROUP BY protocol
ORDER BY avg_tvl DESC;
```

---

## Покрытие требований вакансии

### ✅ Node.js + TypeScript
- Collector сервис полностью на TypeScript
- Современные практики: ESM modules, zod validation, structured logging
- Async/await, typed interfaces, Promise-based

### ✅ PostgreSQL
- Нормализованная схема с 4 таблицами
- Индексы, constraints, JSONB для гибкости
- Миграции как код (SQL)
- Typed queries через postgres client

### ✅ Docker
- Multi-service docker-compose.yml
- Multi-stage Dockerfile для collector
- Health checks, networks, volumes
- Production-ready image (node:22-alpine)

### ✅ Web3 Data Integration
- viem для on-chain чтений (современный стек vs ethers.js)
- ERC-4626 vault state tracking
- DeFiLlama Yields API интеграция
- Понимание DeFi концепций (TVL, APY, IL risk)

### ✅ Testing & CI/CD
- Unit tests с vitest
- TypeScript strict mode
- GitHub Actions jobs: test, typecheck, build, docker
- Coverage готов (vitest.config.ts)

---

## Следующие шаги (Phase 3+)

- [ ] **Phase 3:** Risk Service (Python, FastAPI, scikit-learn)
  - Explainable risk scoring model
  - Feature engineering (TVL volatility, APY sigma, reward ratio, etc.)
  - Anomaly detection (z-score / IsolationForest)
  
- [ ] **Phase 4:** API + Frontend
  - Node.js Fastify API (GET /pools, GET /risk, POST /explain)
  - React + wagmi + viem UI
  - Dashboard, charts, vault interaction
  
- [ ] **Phase 5:** LLM + MCP
  - LLM integration для объяснений
  - Structured output validation
  - Read-only MCP server
  
- [ ] **Phase 6:** DevOps hardening
  - Rate limiting, CORS
  - Kubernetes manifests (optional)
  - Secret management
  - Slither integration fix

---

## Bugs / Issues Found

**Никаких критических багов не обнаружено.**

Минорные исправления в коммитах:
- TypeScript 7 → 5.7 для совместимости с eslint
- bigint serialization для Postgres
- vitest NODE_ENV=test в тестах

---

## Итоги Phase 2

✅ **Полностью завершено:**
1. PostgreSQL schema с миграциями
2. Docker Compose для всего стека
3. TypeScript Collector с viem + DeFiLlama
4. Unit tests, typecheck, build
5. CI/CD jobs (collector, docker)
6. Документация (README, comments, .env.example)

**Время выполнения:** ~2 часа (включая manual QA из Phase 0-1)

**Готово к Phase 3:** Risk Service (Python).

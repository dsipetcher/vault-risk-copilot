# syntax=docker/dockerfile:1.4

FROM node:22-alpine AS hyperliquid-builder

WORKDIR /workspace/hyperliquid

COPY hyperliquid/package*.json hyperliquid/tsconfig.json ./
COPY hyperliquid/src ./src

RUN npm ci && npm run build

FROM node:22-alpine AS builder

WORKDIR /workspace/app

COPY --from=hyperliquid-builder /workspace/hyperliquid /workspace/hyperliquid

COPY collector/package*.json collector/tsconfig.json ./
COPY collector/src ./src

RUN npm ci --only=production=false && \
    npm run build

FROM node:22-alpine AS production

WORKDIR /app

COPY --from=hyperliquid-builder /workspace/hyperliquid /hyperliquid

COPY collector/package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /workspace/app/dist ./dist

USER node

CMD ["node", "dist/index.js"]

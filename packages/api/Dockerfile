# syntax=docker/dockerfile:1.4

# LLM package build stage
FROM node:22-alpine AS llm-builder

WORKDIR /workspace/llm

# Copy llm package files
COPY llm/package*.json llm/tsconfig.json ./
COPY llm/src ./src

# Install dependencies and build llm
RUN npm ci && npm run build

# API build stage
FROM node:22-alpine AS builder

WORKDIR /workspace/app

# Copy llm package from previous stage
COPY --from=llm-builder /workspace/llm /workspace/llm

# Copy package files
COPY api/package*.json api/tsconfig.json ./
COPY api/src ./src

# Install dependencies and build
RUN npm ci --only=production=false && \
    npm run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy llm package
COPY --from=llm-builder /workspace/llm /llm

# Copy package files and install only production dependencies
COPY api/package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder
COPY --from=builder /workspace/app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

CMD ["node", "dist/index.js"]

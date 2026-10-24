FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=base /app/dist ./dist

USER node

ENV NODE_OPTIONS="--no-warnings"

CMD ["node", "--trace-warnings", "dist/index.js"]

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

CMD ["sh", "-c", "echo 'Container CMD started' && ls -la /app && ls -la /app/dist && which node && node --version && node dist/index.js"]

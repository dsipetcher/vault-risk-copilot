FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_CHAIN_ID
ARG VITE_VAULT_ADDRESS
ARG VITE_USDC_ADDRESS
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CHAIN_ID=$VITE_CHAIN_ID
ENV VITE_VAULT_ADDRESS=$VITE_VAULT_ADDRESS
ENV VITE_USDC_ADDRESS=$VITE_USDC_ADDRESS
RUN npm run build

FROM nginx:alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

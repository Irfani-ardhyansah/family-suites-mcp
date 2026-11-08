# Multi-arch friendly (amd64 / arm64) — cocok untuk STB/homelab ARM
# Build: docker build -t family-tree-mcp:latest .
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    MCP_HTTP_HOST=0.0.0.0 \
    MCP_HTTP_PORT=3100

# wget dipakai HEALTHCHECK. Busybox sudah punya wget, tapi dipasang eksplisit
# supaya perilakunya sama dengan image API.
RUN apk add --no-cache wget

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
  && chown -R node:node /app

USER node

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${MCP_HTTP_PORT}/health" >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]

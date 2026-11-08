#!/bin/sh
set -eu

echo "[family-mcp] starting on ${MCP_HTTP_HOST:-0.0.0.0}:${MCP_HTTP_PORT:-3100}"
echo "[family-mcp] API: ${FAMILY_API_BASE_URL:-<belum diisi>}"

exec node dist/index.js

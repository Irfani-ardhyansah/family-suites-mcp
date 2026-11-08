import 'dotenv/config';

function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV?.trim() || 'development',
  MCP_HTTP_HOST: process.env.MCP_HTTP_HOST?.trim() || '0.0.0.0',
  MCP_HTTP_PORT: parseInteger(process.env.MCP_HTTP_PORT, 3100),
  FAMILY_API_BASE_URL: process.env.FAMILY_API_BASE_URL?.trim() || '',
  FAMILY_MCP_REQUEST_TIMEOUT_MS: parseInteger(
    process.env.FAMILY_MCP_REQUEST_TIMEOUT_MS,
    15_000,
  ),
  FAMILY_MCP_ENABLE_WRITE: parseBoolean(
    process.env.FAMILY_MCP_ENABLE_WRITE,
    true,
  ),
  FAMILY_MCP_ENABLE_DESTRUCTIVE: parseBoolean(
    process.env.FAMILY_MCP_ENABLE_DESTRUCTIVE,
    false,
  ),
  FAMILY_MCP_LOG_LEVEL: process.env.FAMILY_MCP_LOG_LEVEL?.trim() || 'info',
} as const;

export function assertRuntimeEnv(): void {
  const missing: string[] = [];
  if (!env.FAMILY_API_BASE_URL) missing.push('FAMILY_API_BASE_URL');
  if (!Number.isInteger(env.MCP_HTTP_PORT) || env.MCP_HTTP_PORT <= 0) {
    missing.push('MCP_HTTP_PORT');
  }
  if (missing.length > 0) {
    throw new Error(`Env wajib belum diisi: ${missing.join(', ')}`);
  }
}

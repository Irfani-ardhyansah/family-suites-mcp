import { getRequestAuthorization } from '../auth/passthrough.js';
import { env } from '../config/env.js';
import { FamilyApiError, ToolInputError } from '../errors.js';
import { isRecord } from '../utils/objects.js';

type QueryValue = string | number | boolean | null | undefined;

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  timeoutMs?: number;
};

function buildUrl(path: string, query?: Record<string, QueryValue>): URL {
  const base = env.FAMILY_API_BASE_URL.replace(/\/+$/, '');
  if (!base) {
    throw new ToolInputError('FAMILY_API_BASE_URL belum diisi.');
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, typeof value === 'boolean' ? String(value) : String(value));
  }

  return url;
}

function unwrapPayload(payload: unknown): unknown {
  if (isRecord(payload) && Object.hasOwn(payload, 'data')) {
    return payload.data;
  }
  return payload;
}

function parsePayload(text: string): unknown {
  if (text.trim() === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function errorFromResponse(status: number, payload: unknown): FamilyApiError {
  const envelope = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
  const code =
    typeof envelope.code === 'string' && envelope.code.trim() !== ''
      ? envelope.code
      : 'API_ERROR';
  const message =
    typeof envelope.message === 'string' && envelope.message.trim() !== ''
      ? envelope.message
      : `FamilyRoots API membalas HTTP ${status}.`;
  const requestId =
    typeof envelope.requestId === 'string' ? envelope.requestId : undefined;

  return new FamilyApiError({
    status,
    code,
    message,
    ...(requestId ? { requestId } : {}),
    ...(envelope.details !== undefined ? { details: envelope.details } : {}),
  });
}

/**
 * Panggil REST API dengan token MCP dari request yang sedang berjalan.
 * Semua request memakai pass-through: tidak ada login/refresh di service ini.
 */
export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const authorization = getRequestAuthorization();
  const url = buildUrl(path, options.query);
  const hasBody = options.body !== undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        authorization,
        accept: 'application/json',
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
      },
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(
        options.timeoutMs ?? env.FAMILY_MCP_REQUEST_TIMEOUT_MS,
      ),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new FamilyApiError({
      status: 503,
      code: 'API_UNREACHABLE',
      message: `Tidak bisa menghubungi FamilyRoots API: ${message}`,
    });
  }

  const text = await response.text();
  const payload = parsePayload(text);

  if (!response.ok) {
    throw errorFromResponse(response.status, payload);
  }

  return unwrapPayload(payload) as T;
}

export function apiGet<T>(
  path: string,
  query?: Record<string, QueryValue>,
): Promise<T> {
  return apiRequest<T>(path, { query });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PUT', body });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}

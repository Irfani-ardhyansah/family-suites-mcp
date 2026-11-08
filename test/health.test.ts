import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const originalBaseUrl = process.env.FAMILY_API_BASE_URL;
const originalTimeout = process.env.FAMILY_MCP_REQUEST_TIMEOUT_MS;
const originalLogLevel = process.env.FAMILY_MCP_LOG_LEVEL;

let apiHealthy = true;

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

const apiServer = http.createServer((req, res) => {
  if (req.url === '/api/v1/health') {
    res.writeHead(apiHealthy ? 200 : 500, {
      'content-type': 'application/json',
    });
    res.end(JSON.stringify({ status: apiHealthy ? 'ok' : 'down' }));
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

const apiPort = await listen(apiServer);

process.env.FAMILY_API_BASE_URL = `http://127.0.0.1:${apiPort}/api/v1`;
process.env.FAMILY_MCP_REQUEST_TIMEOUT_MS = '500';
process.env.FAMILY_MCP_LOG_LEVEL = 'error';

const { createApp } = await import('../src/index.js');

describe('health endpoints', () => {
  let appServer: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    appServer = http.createServer(createApp());
    const port = await listen(appServer);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (appServer) await close(appServer);
    await close(apiServer);

    if (originalBaseUrl === undefined) delete process.env.FAMILY_API_BASE_URL;
    else process.env.FAMILY_API_BASE_URL = originalBaseUrl;
    if (originalTimeout === undefined) delete process.env.FAMILY_MCP_REQUEST_TIMEOUT_MS;
    else process.env.FAMILY_MCP_REQUEST_TIMEOUT_MS = originalTimeout;
    if (originalLogLevel === undefined) delete process.env.FAMILY_MCP_LOG_LEVEL;
    else process.env.FAMILY_MCP_LOG_LEVEL = originalLogLevel;
  });

  it('GET /health tetap ok walau API sedang gagal', async () => {
    apiHealthy = false;
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      status: string;
      service: string;
      uptimeSeconds: number;
    };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('family-mcp');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    apiHealthy = true;
  });

  it('GET /health/ready 200 saat API terjangkau', async () => {
    apiHealthy = true;
    const response = await fetch(`${baseUrl}/health/ready`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      status: string;
      api: { ok: boolean; status: number };
    };
    expect(body.status).toBe('ok');
    expect(body.api.ok).toBe(true);
    expect(body.api.status).toBe(200);
  });

  it('GET /health/ready 503 saat API gagal', async () => {
    apiHealthy = false;
    const response = await fetch(`${baseUrl}/health/ready`);
    expect(response.status).toBe(503);

    const body = (await response.json()) as {
      status: string;
      api: { ok: boolean; status: number };
    };
    expect(body.status).toBe('degraded');
    expect(body.api.ok).toBe(false);
    expect(body.api.status).toBe(500);
    apiHealthy = true;
  });
});

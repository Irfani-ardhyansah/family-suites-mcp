import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalBaseUrl = process.env.FAMILY_API_BASE_URL;
const originalTimeout = process.env.FAMILY_MCP_REQUEST_TIMEOUT_MS;

describe('api client', () => {
  beforeEach(() => {
    process.env.FAMILY_API_BASE_URL = 'http://api.test/api/v1';
    process.env.FAMILY_MCP_REQUEST_TIMEOUT_MS = '1000';
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalBaseUrl === undefined) delete process.env.FAMILY_API_BASE_URL;
    else process.env.FAMILY_API_BASE_URL = originalBaseUrl;
    if (originalTimeout === undefined) delete process.env.FAMILY_MCP_REQUEST_TIMEOUT_MS;
    else process.env.FAMILY_MCP_REQUEST_TIMEOUT_MS = originalTimeout;
  });

  it('meneruskan Authorization, menyusun query, dan membuka envelope data', async () => {
    const fetchMock = vi.fn(
      async (_url: URL | string, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: { items: [1, 2] } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { runWithAuthorization } = await import('../src/auth/passthrough.js');
    const { apiGet } = await import('../src/api/client.js');

    const result = await runWithAuthorization('Bearer frmcp_test', () =>
      apiGet('/persons', {
        scope: 'family',
        page: 1,
        empty: undefined,
        includeArchived: false,
      }),
    );

    expect(result).toEqual({ items: [1, 2] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      'http://api.test/api/v1/persons?scope=family&page=1&includeArchived=false',
    );
    expect(init).toMatchObject({
      method: 'GET',
      headers: {
        authorization: 'Bearer frmcp_test',
        accept: 'application/json',
      },
    });
  });

  it('memetakan error envelope API ke FamilyApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'MCP_TOKEN_INVALID',
                message: 'Token MCP tidak valid.',
                requestId: 'req-9',
              },
            }),
            {
              status: 401,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    );

    const { runWithAuthorization } = await import('../src/auth/passthrough.js');
    const { apiGet } = await import('../src/api/client.js');

    await expect(
      runWithAuthorization('Bearer frmcp_bad', () => apiGet('/auth/me')),
    ).rejects.toMatchObject({
      status: 401,
      code: 'MCP_TOKEN_INVALID',
      message: 'Token MCP tidak valid.',
      requestId: 'req-9',
    });
  });

  it('mengirim body JSON untuk POST', async () => {
    const fetchMock = vi.fn(
      async (_url: URL | string, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: { id: 7 } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { runWithAuthorization } = await import('../src/auth/passthrough.js');
    const { apiPost } = await import('../src/api/client.js');

    const result = await runWithAuthorization('Bearer frmcp_test', () =>
      apiPost('/tasks', { title: 'Test' }),
    );

    expect(result).toEqual({ id: 7 });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        authorization: 'Bearer frmcp_test',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Test' }),
    });
  });
});

import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import {
  getRequestAuthorization,
  requireMcpBearer,
  runWithAuthorization,
} from '../src/auth/passthrough.js';

function mockRequest(authorization?: string): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === 'authorization' ? authorization : undefined,
  } as unknown as Request;
}

function mockResponse(): {
  res: Response;
  getStatus: () => number;
  getBody: () => unknown;
} {
  let status = 200;
  let body: unknown;
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;

  return { res, getStatus: () => status, getBody: () => body };
}

describe('requireMcpBearer', () => {
  it('menerima Bearer frmcp_... dan menyimpan authorization di AsyncLocalStorage', () => {
    const { res } = mockResponse();
    let nextCalled = false;
    let captured = '';

    requireMcpBearer(mockRequest('Bearer frmcp_abc123'), res, () => {
      nextCalled = true;
      captured = getRequestAuthorization();
    });

    expect(nextCalled).toBe(true);
    expect(captured).toBe('Bearer frmcp_abc123');
  });

  it('menolak request tanpa header Authorization', () => {
    const { res, getStatus, getBody } = mockResponse();
    let nextCalled = false;

    requireMcpBearer(mockRequest(), res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(getStatus()).toBe(401);
    expect(getBody()).toMatchObject({
      error: { code: 'MCP_AUTH_MISSING' },
    });
  });

  it('menolak token yang bukan frmcp_', () => {
    const { res, getStatus, getBody } = mockResponse();
    let nextCalled = false;

    requireMcpBearer(mockRequest('Bearer jwt-token-biasa'), res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(getStatus()).toBe(401);
    expect(getBody()).toMatchObject({
      error: { code: 'MCP_AUTH_INVALID' },
    });
  });
});

describe('runWithAuthorization', () => {
  it('membuat konteks auth untuk unit test/tooling', () => {
    const value = runWithAuthorization('Bearer frmcp_test', () =>
      getRequestAuthorization(),
    );
    expect(value).toBe('Bearer frmcp_test');
  });

  it('melempar error di luar konteks request', () => {
    expect(() => getRequestAuthorization()).toThrow(/konteks Authorization/);
  });
});

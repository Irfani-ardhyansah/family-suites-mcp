import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export const MCP_TOKEN_PREFIX = 'frmcp_';

type RequestAuth = {
  authorization: string;
};

const authStorage = new AsyncLocalStorage<RequestAuth>();

function unauthorized(res: Response, code: string, message: string): void {
  res.status(401).json({ error: { code, message } });
}

/**
 * Ambil `Authorization: Bearer frmcp_...` dari request MCP, simpan di
 * AsyncLocalStorage, lalu teruskan ke API. Token tidak pernah disimpan.
 */
export function requireMcpBearer(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const header = req.header('authorization')?.trim();
  if (!header) {
    unauthorized(
      res,
      'MCP_AUTH_MISSING',
      'Header Authorization Bearer frmcp_... wajib dikirim.',
    );
    return;
  }

  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim();
  if (!token || !token.startsWith(MCP_TOKEN_PREFIX)) {
    unauthorized(
      res,
      'MCP_AUTH_INVALID',
      `Token MCP harus diawali ${MCP_TOKEN_PREFIX}.`,
    );
    return;
  }

  authStorage.run({ authorization: `Bearer ${token}` }, () => next());
}

export function getRequestAuthorization(): string {
  const store = authStorage.getStore();
  if (!store) {
    throw new Error(
      'Tidak ada konteks Authorization MCP pada request ini. Pastikan route memakai requireMcpBearer.',
    );
  }
  return store.authorization;
}

/** Dipakai unit test dan tooling internal. */
export function runWithAuthorization<T>(authorization: string, fn: () => T): T {
  return authStorage.run({ authorization }, fn);
}

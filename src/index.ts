import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { getRequestAuthorization, requireMcpBearer } from './auth/passthrough.js';
import { assertRuntimeEnv, env } from './config/env.js';
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from './server.js';

type Session = {
  transport: StreamableHTTPServerTransport;
  tokenHash: string;
  openResponses: number;
  lastActiveAt: number;
};

const MAX_SESSIONS = 500;
const SESSION_IDLE_MS = 30 * 60 * 1000;

const sessions = new Map<string, Session>();

const levelWeight: Record<string, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function log(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
): void {
  const configured = levelWeight[env.FAMILY_MCP_LOG_LEVEL] ?? levelWeight.info;
  if (levelWeight[level] < configured) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : '';
  console[level](`[${SERVER_NAME}] ${message}${suffix}`);
}

function fingerprintAuthorization(authorization: string): string {
  return createHash('sha256').update(authorization).digest('hex');
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function trackResponse(session: Session, res: Response): void {
  if (!res.socket || res.socket.destroyed) return;
  session.openResponses += 1;
  session.lastActiveAt = Date.now();
  res.on('close', () => {
    session.openResponses = Math.max(0, session.openResponses - 1);
    session.lastActiveAt = Date.now();
  });
}

function sessionForRequest(
  req: Request,
  res: Response,
): { session: Session; sessionId: string } | null {
  const sessionId = headerValue(req, 'mcp-session-id');
  if (!sessionId) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Missing mcp-session-id header.' },
      id: null,
    });
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({
      jsonrpc: '2.0',
      error: {
        code: -32001,
        message: 'Session not found atau sudah kedaluwarsa. Mulai session baru.',
      },
      id: null,
    });
    return null;
  }

  const tokenHash = fingerprintAuthorization(getRequestAuthorization());
  if (session.tokenHash !== tokenHash) {
    res.status(403).json({
      jsonrpc: '2.0',
      error: {
        code: -32003,
        message: 'Session ini milik token MCP lain.',
      },
      id: null,
    });
    return null;
  }

  trackResponse(session, res);
  return { session, sessionId };
}

type ApiHealth = {
  ok: boolean;
  status?: number;
  latencyMs: number;
  error?: string;
};

async function checkApiHealth(): Promise<ApiHealth> {
  const startedAt = Date.now();
  const url = `${env.FAMILY_API_BASE_URL.replace(/\/+$/, '')}/health`;
  const timeoutMs = Math.min(env.FAMILY_MCP_REQUEST_TIMEOUT_MS, 5_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const startedAt = Date.now();
    const requestId = req.header('x-request-id')?.trim() || randomUUID();
    res.setHeader('x-request-id', requestId);
    res.on('finish', () => {
      const isHealth = req.path === '/health' || req.path === '/health/ready';
      log(isHealth ? 'debug' : 'info', 'HTTP request', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        sessionId: headerValue(req, 'mcp-session-id'),
      });
    });
    next();
  });

  app.get('/health', (_req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.json({
      status: 'ok',
      service: SERVER_NAME,
      version: SERVER_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      sessions: sessions.size,
      writeEnabled: env.FAMILY_MCP_ENABLE_WRITE,
      destructiveEnabled: env.FAMILY_MCP_ENABLE_DESTRUCTIVE,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/ready', async (_req, res) => {
    const api = await checkApiHealth();
    res.setHeader('cache-control', 'no-store');
    res.status(api.ok ? 200 : 503).json({
      status: api.ok ? 'ok' : 'degraded',
      service: SERVER_NAME,
      version: SERVER_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      sessions: sessions.size,
      api,
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/mcp', requireMcpBearer, async (req, res) => {
    try {
      const sessionId = headerValue(req, 'mcp-session-id');
      const authorization = getRequestAuthorization();
      const tokenHash = fingerprintAuthorization(authorization);

      if (sessionId) {
        const existing = sessions.get(sessionId);
        if (!existing) {
          res.status(404).json({
            jsonrpc: '2.0',
            error: {
              code: -32001,
              message: 'Session not found atau sudah kedaluwarsa. Mulai session baru.',
            },
            id: null,
          });
          return;
        }
        if (existing.tokenHash !== tokenHash) {
          res.status(403).json({
            jsonrpc: '2.0',
            error: {
              code: -32003,
              message: 'Session ini milik token MCP lain.',
            },
            id: null,
          });
          return;
        }

        trackResponse(existing, res);
        await existing.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: kirim initialize request atau mcp-session-id.',
          },
          id: null,
        });
        return;
      }

      if (sessions.size >= MAX_SESSIONS) {
        res.status(503).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Terlalu banyak session MCP aktif.' },
          id: null,
        });
        return;
      }

      let transport: StreamableHTTPServerTransport;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions.set(newSessionId, {
            transport,
            tokenHash,
            openResponses: 0,
            lastActiveAt: Date.now(),
          });
          log('info', 'Session MCP dibuat', { sessionId: newSessionId });
        },
      });

      transport.onclose = () => {
        const closedId = transport.sessionId;
        if (closedId && sessions.delete(closedId)) {
          log('info', 'Session MCP ditutup', { sessionId: closedId });
        }
      };

      transport.onerror = (error) => {
        log('error', 'Transport MCP error', { message: error.message });
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      log('error', 'Gagal menangani POST /mcp', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', requireMcpBearer, async (req, res) => {
    try {
      const selected = sessionForRequest(req, res);
      if (!selected) return;
      await selected.session.transport.handleRequest(req, res);
    } catch (error) {
      log('error', 'Gagal menangani GET /mcp', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.delete('/mcp', requireMcpBearer, async (req, res) => {
    try {
      const selected = sessionForRequest(req, res);
      if (!selected) return;
      await selected.session.transport.handleRequest(req, res);
      sessions.delete(selected.sessionId);
    } catch (error) {
      log('error', 'Gagal menangani DELETE /mcp', {
        message: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).send('Error processing session termination');
      }
    }
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log('error', 'Unhandled HTTP error', {
      message: err instanceof Error ? err.message : String(err),
    });
    if (!res.headersSent) {
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
  });

  return app;
}

function cleanupIdleSessions(): void {
  const cutoff = Date.now() - SESSION_IDLE_MS;
  for (const [sessionId, session] of sessions) {
    if (session.openResponses === 0 && session.lastActiveAt < cutoff) {
      session.transport.close().catch((error: unknown) => {
        log('warn', 'Gagal menutup session idle', {
          sessionId,
          message: error instanceof Error ? error.message : String(error),
        });
      });
      sessions.delete(sessionId);
      log('info', 'Session idle dibersihkan', { sessionId });
    }
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entry);
  } catch {
    return false;
  }
}

function main(): void {
  assertRuntimeEnv();

  process.on('uncaughtException', (error) => {
    log('error', 'uncaughtException', {
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    log('error', 'unhandledRejection', {
      message: reason instanceof Error ? reason.message : String(reason),
    });
  });

  const app = createApp();
  const httpServer = http.createServer(app);

  const cleanupTimer = setInterval(cleanupIdleSessions, 60_000);
  cleanupTimer.unref();

  httpServer.listen(env.MCP_HTTP_PORT, env.MCP_HTTP_HOST, () => {
    log('info', 'MCP Streamable HTTP server listening', {
      host: env.MCP_HTTP_HOST,
      port: env.MCP_HTTP_PORT,
      api: env.FAMILY_API_BASE_URL,
      writeEnabled: env.FAMILY_MCP_ENABLE_WRITE,
      destructiveEnabled: env.FAMILY_MCP_ENABLE_DESTRUCTIVE,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    log('info', `Menerima ${signal}, menutup server...`);
    clearInterval(cleanupTimer);
    await Promise.all(
      [...sessions.values()].map((session) =>
        session.transport.close().catch(() => undefined),
      ),
    );
    sessions.clear();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

if (isDirectRun()) {
  main();
}

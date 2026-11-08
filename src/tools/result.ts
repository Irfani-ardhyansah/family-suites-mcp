import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { env } from '../config/env.js';
import { mapError, ToolInputError } from '../errors.js';
import { isRecord } from '../utils/objects.js';

export function ok(data: unknown, summary?: string): CallToolResult {
  const json = JSON.stringify(data, null, 2);
  const text = summary ? `${summary}\n\n${json}` : json;
  return {
    content: [{ type: 'text', text }],
    structuredContent: isRecord(data) ? data : { result: data },
  };
}

export function fail(error: unknown): CallToolResult {
  const mapped = mapError(error);
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(mapped, null, 2) }],
    structuredContent: mapped,
  };
}

export function requireWriteEnabled(): void {
  if (!env.FAMILY_MCP_ENABLE_WRITE) {
    throw new ToolInputError(
      'Tool tulis dinonaktifkan. Set FAMILY_MCP_ENABLE_WRITE=true bila memang ingin mengizinkan perubahan.',
    );
  }
}

export function requireDestructiveEnabled(): void {
  requireWriteEnabled();
  if (!env.FAMILY_MCP_ENABLE_DESTRUCTIVE) {
    throw new ToolInputError(
      'Tool destruktif dinonaktifkan. Set FAMILY_MCP_ENABLE_DESTRUCTIVE=true dan gunakan approval Nouride.',
    );
  }
}

export function requireConfirm(
  confirm: string | undefined,
  expected: string,
): void {
  if (confirm !== expected) {
    throw new ToolInputError(
      `Konfirmasi tidak cocok. Kirim confirm: "${expected}" setelah user menyetujui aksi ini.`,
    );
  }
}

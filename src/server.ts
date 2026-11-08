import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFamilyTools } from './tools/family.js';
import { registerMoneyTools } from './tools/money.js';
import { registerTaskTools } from './tools/task.js';

export const SERVER_NAME = 'family-mcp';
export const SERVER_VERSION = '0.1.0';

export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: [
        'Kamu adalah family-mcp, MCP server untuk keluarga pengguna.',
        'Token MCP yang dikirim Nouride adalah identitas person. Jangan pernah meminta, menampilkan, atau menyimpan token mentah.',
        'Mulai dengan family_whoami untuk identitas, task_get_context untuk Task Board, dan money_get_context untuk Money Track.',
        'Family Roots bersifat read-only. Jangan mengarang ID person/task/transaksi; cari dulu dengan tool list/search.',
        'Task Board: status valid hanya To-Do, In Progress, Merge Request, Merged. "Done" tidak valid.',
        'Revisi task hanya boleh dibuat dari task induk berstatus Merged.',
        'MCP hanya mencatat branchName. Jangan membuat, memindah, atau menghapus branch Git.',
        'Tool destruktif butuh flag FAMILY_MCP_ENABLE_DESTRUCTIVE dan konfirmasi eksplisit; minta approval Nouride.',
        'Money Track otomatis tersedia untuk semua token. Tool tulis transaksi/transfer/tarik tunai aktif bila FAMILY_MCP_ENABLE_WRITE=true; cek saldo pocket sumber sebelum transfer.',
        'Family Core/Household tetap butuh unlock modul di API.',
      ].join(' '),
    },
  );

  registerFamilyTools(server);
  registerMoneyTools(server);
  registerTaskTools(server);

  return server;
}

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getMoneyDashboard,
  getMoneyPreferences,
  getMoneySetup,
  getMonthlyReport,
  getTransaction,
  listAccounts,
  listActivity,
  listBudgets,
  listCategories,
  listDebts,
  listPockets,
  listTransactions,
  listWishlist,
  type MoneyQuery,
} from '../api/money.js';
import { fail, ok } from './result.js';

function compactQuery(input: MoneyQuery): MoneyQuery {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== ''),
  );
}

async function settle<T>(
  fn: () => Promise<T>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await fn(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const transactionTypes = [
  'income',
  'expense',
  'opening_balance',
  'adjustment',
] as const;
const activityKinds = [
  'income',
  'expense',
  'transfer',
  'cash_withdrawal',
  'debt',
  'all',
] as const;
const debtDirections = ['utang', 'piutang'] as const;
const debtStatuses = ['open', 'partial', 'paid'] as const;

export function registerMoneyTools(server: McpServer): void {
  server.registerTool(
    'money_get_context',
    {
      title: 'Konteks Money Track',
      description:
        'Ringkasan awal Money Track: setup workspace, dashboard, akun, pocket, kategori, dan preferensi. Pakai ini sebelum transaksi.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const [setup, dashboard, accounts, pockets, categories, preferences] =
        await Promise.all([
          settle(getMoneySetup),
          settle(getMoneyDashboard),
          settle(() => listAccounts()),
          settle(() => listPockets({ includeArchived: false })),
          settle(() => listCategories()),
          settle(getMoneyPreferences),
        ]);

      return ok({
        setup: setup.data,
        dashboard: dashboard.data,
        accounts: accounts.data,
        pockets: pockets.data,
        categories: categories.data,
        preferences: preferences.data,
        errors: {
          setup: setup.error,
          dashboard: dashboard.error,
          accounts: accounts.error,
          pockets: pockets.error,
          categories: categories.error,
          preferences: preferences.error,
        },
      });
    },
  );

  server.registerTool(
    'money_get_dashboard',
    {
      title: 'Dashboard Money Track',
      description: 'Ambil ringkasan saldo, pemasukan, pengeluaran, dan budget.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return ok(await getMoneyDashboard());
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_list_accounts',
    {
      title: 'Daftar akun Money Track',
      description: 'Daftar akun bank/e-wallet/cash. Bisa filter per person.',
      inputSchema: {
        personId: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ personId }) => {
      try {
        const accounts = await listAccounts(personId);
        return ok({ count: accounts.length, accounts });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_list_pockets',
    {
      title: 'Daftar pocket Money Track',
      description:
        'Daftar pocket/kantong. `ownerType` person|joint; default semua. Sertakan arsip bila perlu.',
      inputSchema: {
        personId: z.number().int().positive().optional(),
        ownerType: z.enum(['person', 'joint']).optional(),
        includeArchived: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ personId, ownerType, includeArchived }) => {
      try {
        const pockets = await listPockets({
          personId,
          ownerType,
          includeArchived,
        });
        return ok({ count: pockets.length, pockets });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_list_categories',
    {
      title: 'Daftar kategori Money Track',
      description: 'Daftar kategori pemasukan/pengeluaran.',
      inputSchema: {
        type: z.enum(['income', 'expense']).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ type }) => {
      try {
        const categories = await listCategories({ type });
        return ok({ count: categories.length, categories });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_list_transactions',
    {
      title: 'Daftar transaksi',
      description:
        'Daftar transaksi dengan filter tanggal/person/pocket/kategori/tipe dan pencarian teks. Pakai pageSize kecil untuk respons ringkas.',
      inputSchema: {
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        personId: z.number().int().positive().optional(),
        pocketId: z.number().int().positive().optional(),
        type: z.enum(transactionTypes).optional(),
        categoryId: z.number().int().positive().optional(),
        q: z.string().trim().max(120).optional(),
        uncategorized: z.boolean().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        const data = await listTransactions(compactQuery(input));
        return ok(data, `${data.items.length} transaksi pada halaman ini.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_get_transaction',
    {
      title: 'Detail transaksi',
      description: 'Ambil satu transaksi berdasarkan ID.',
      inputSchema: {
        transactionId: z.number().int().positive(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ transactionId }) => {
      try {
        return ok(await getTransaction(transactionId));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_list_activity',
    {
      title: 'Activity feed Money Track',
      description:
        'Feed gabungan transaksi, transfer, cash withdrawal, dan debt. Filter kind, tanggal, person, pocket, kategori, dan teks.',
      inputSchema: {
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        kind: z.enum(activityKinds).optional(),
        personId: z.number().int().positive().optional(),
        pocketId: z.number().int().positive().optional(),
        categoryId: z.number().int().positive().optional(),
        q: z.string().trim().max(120).optional(),
        uncategorized: z.boolean().optional(),
        includeDebts: z.boolean().optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        const data = await listActivity(compactQuery(input));
        return ok(data, `${data.items.length} aktivitas pada halaman ini.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_list_debts',
    {
      title: 'Daftar utang/piutang',
      description:
        'Daftar debt. `direction` utang|piutang, `status` open|partial|paid.',
      inputSchema: {
        status: z.enum(debtStatuses).optional(),
        direction: z.enum(debtDirections).optional(),
        pocketId: z.number().int().positive().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        const debts = await listDebts(compactQuery(input));
        return ok({ count: debts.length, debts });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_list_budgets',
    {
      title: 'Daftar budget bulanan',
      description: 'Ambil budget untuk satu bulan (format YYYY-MM).',
      inputSchema: {
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/).describe('Contoh: 2026-11'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ yearMonth }) => {
      try {
        const budgets = await listBudgets(yearMonth);
        return ok({ yearMonth, count: budgets.length, budgets });
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_get_monthly_report',
    {
      title: 'Laporan bulanan',
      description: 'Laporan evaluasi bulanan Money Track (YYYY-MM).',
      inputSchema: {
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ yearMonth }) => {
      try {
        return ok(await getMonthlyReport(yearMonth));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_list_wishlist',
    {
      title: 'Wishlist Money Track',
      description: 'Daftar wishlist beserta target dan progres.',
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      try {
        return ok(await listWishlist());
      } catch (error) {
        return fail(error);
      }
    },
  );
}

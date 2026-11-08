import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createCashWithdrawal,
  createTransaction,
  createTransfer,
  deleteCashWithdrawal,
  deleteTransaction,
  deleteTransfer,
  getCashWithdrawal,
  getMoneyDashboard,
  getMoneyPreferences,
  getMoneySetup,
  getMonthlyReport,
  getTransaction,
  getTransfer,
  listAccounts,
  listActivity,
  listBudgets,
  listCashWithdrawals,
  listCategories,
  listDebts,
  listPockets,
  listTransactions,
  listWishlist,
  updateCashWithdrawal,
  updateTransaction,
  updateTransfer,
  type MoneyCashWithdrawalCreateInput,
  type MoneyCashWithdrawalUpdateInput,
  type MoneyQuery,
  type MoneyTransactionCreateInput,
  type MoneyTransactionType,
  type MoneyTransactionUpdateInput,
  type MoneyTransferCreateInput,
  type MoneyTransferUpdateInput,
} from '../api/money.js';
import { ToolInputError } from '../errors.js';
import {
  fail,
  ok,
  requireConfirm,
  requireDestructiveEnabled,
  requireWriteEnabled,
} from './result.js';

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
const transferKinds = ['interpersonal', 'interpocket'] as const;

function requireAtLeastOne(
  input: Record<string, unknown>,
  message: string,
): void {
  if (Object.values(input).every((value) => value === undefined)) {
    throw new ToolInputError(message);
  }
}

function assertTransactionAmount(
  type: MoneyTransactionType,
  amount: number,
): void {
  if (type === 'adjustment') return;
  if (amount <= 0) {
    throw new ToolInputError('amount harus lebih dari 0 untuk tipe ini.');
  }
}

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
    'money_create_transaction',
    {
      title: 'Catat transaksi',
      description:
        'Catat transaksi income/expense/opening_balance/adjustment. amount bilangan bulat rupiah. Untuk opening_balance/adjustment: categoryId harus null dan note wajib. Butuh FAMILY_MCP_ENABLE_WRITE=true.',
      inputSchema: {
        pocketId: z.number().int().positive(),
        type: z.enum(transactionTypes),
        amount: z.number().int(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD.'),
        categoryId: z.number().int().positive().nullable().optional(),
        note: z.string().trim().max(500).nullable().optional(),
        attachmentMediaId: z.string().nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      try {
        requireWriteEnabled();
        assertTransactionAmount(input.type, input.amount);
        if (input.type === 'opening_balance' || input.type === 'adjustment') {
          if (input.categoryId != null) {
            throw new ToolInputError(
              'categoryId harus null untuk opening_balance/adjustment.',
            );
          }
          if (!input.note?.trim()) {
            throw new ToolInputError(
              'note wajib untuk opening_balance/adjustment.',
            );
          }
        }
        const payload: MoneyTransactionCreateInput = {
          pocketId: input.pocketId,
          type: input.type,
          amount: input.amount,
          date: input.date,
          categoryId: input.categoryId,
          note: input.note,
          attachmentMediaId: input.attachmentMediaId,
        };
        const transaction = await createTransaction(payload);
        return ok(
          transaction,
          `Transaksi ${input.type} Rp${input.amount.toLocaleString('id-ID')} dicatat.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_update_transaction',
    {
      title: 'Edit transaksi',
      description:
        'Update partial transaksi. Kirim hanya field yang berubah. Untuk mengosongkan categoryId/note/attachmentMediaId, kirim null. Butuh FAMILY_MCP_ENABLE_WRITE=true.',
      inputSchema: {
        transactionId: z.number().int().positive(),
        pocketId: z.number().int().positive().optional(),
        type: z.enum(transactionTypes).optional(),
        amount: z.number().int().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD.').optional(),
        categoryId: z.number().int().positive().nullable().optional(),
        note: z.string().trim().max(500).nullable().optional(),
        attachmentMediaId: z.string().nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ transactionId, ...input }) => {
      try {
        requireWriteEnabled();
        requireAtLeastOne(input, 'Minimal satu field harus diisi untuk edit transaksi.');
        if (input.amount !== undefined && input.type !== undefined) {
          assertTransactionAmount(input.type, input.amount);
        }
        const payload: MoneyTransactionUpdateInput = {
          pocketId: input.pocketId,
          type: input.type,
          amount: input.amount,
          date: input.date,
          categoryId: input.categoryId,
          note: input.note,
          attachmentMediaId: input.attachmentMediaId,
        };
        const transaction = await updateTransaction(transactionId, payload);
        return ok(transaction, `Transaksi #${transactionId} diperbarui.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_delete_transaction',
    {
      title: 'Hapus transaksi',
      description:
        'Hapus transaksi permanen. Butuh FAMILY_MCP_ENABLE_DESTRUCTIVE=true dan konfirmasi eksplisit.',
      inputSchema: {
        transactionId: z.number().int().positive(),
        confirm: z
          .string()
          .describe('Kirim "DELETE TRANSACTION <transactionId>".'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ transactionId, confirm }) => {
      try {
        requireDestructiveEnabled();
        requireConfirm(confirm, `DELETE TRANSACTION ${transactionId}`);
        await deleteTransaction(transactionId);
        return ok(
          { deleted: true, transactionId },
          `Transaksi #${transactionId} dihapus.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_get_transfer',
    {
      title: 'Detail transfer',
      description: 'Ambil satu transfer berdasarkan ID.',
      inputSchema: {
        transferId: z.number().int().positive(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ transferId }) => {
      try {
        return ok(await getTransfer(transferId));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_create_transfer',
    {
      title: 'Catat transfer',
      description:
        'Transfer antar pocket. kind interpersonal|interpocket; saldo pocket sumber harus cukup. Butuh FAMILY_MCP_ENABLE_WRITE=true.',
      inputSchema: {
        kind: z.enum(transferKinds),
        fromPocketId: z.number().int().positive(),
        toPocketId: z.number().int().positive(),
        amount: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD.'),
        note: z.string().trim().max(500).nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      try {
        requireWriteEnabled();
        const payload: MoneyTransferCreateInput = {
          kind: input.kind,
          fromPocketId: input.fromPocketId,
          toPocketId: input.toPocketId,
          amount: input.amount,
          date: input.date,
          note: input.note,
        };
        const transfer = await createTransfer(payload);
        return ok(
          transfer,
          `Transfer Rp${input.amount.toLocaleString('id-ID')} dicatat.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_update_transfer',
    {
      title: 'Edit transfer',
      description:
        'Update partial transfer. Kirim hanya field yang berubah. Butuh FAMILY_MCP_ENABLE_WRITE=true.',
      inputSchema: {
        transferId: z.number().int().positive(),
        kind: z.enum(transferKinds).optional(),
        fromPocketId: z.number().int().positive().optional(),
        toPocketId: z.number().int().positive().optional(),
        amount: z.number().int().positive().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD.').optional(),
        note: z.string().trim().max(500).nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ transferId, ...input }) => {
      try {
        requireWriteEnabled();
        requireAtLeastOne(input, 'Minimal satu field harus diisi untuk edit transfer.');
        const payload: MoneyTransferUpdateInput = {
          kind: input.kind,
          fromPocketId: input.fromPocketId,
          toPocketId: input.toPocketId,
          amount: input.amount,
          date: input.date,
          note: input.note,
        };
        const transfer = await updateTransfer(transferId, payload);
        return ok(transfer, `Transfer #${transferId} diperbarui.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_delete_transfer',
    {
      title: 'Hapus transfer',
      description:
        'Hapus transfer permanen. Butuh FAMILY_MCP_ENABLE_DESTRUCTIVE=true dan konfirmasi eksplisit.',
      inputSchema: {
        transferId: z.number().int().positive(),
        confirm: z.string().describe('Kirim "DELETE TRANSFER <transferId>".'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ transferId, confirm }) => {
      try {
        requireDestructiveEnabled();
        requireConfirm(confirm, `DELETE TRANSFER ${transferId}`);
        await deleteTransfer(transferId);
        return ok(
          { deleted: true, transferId },
          `Transfer #${transferId} dihapus.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_list_cash_withdrawals',
    {
      title: 'Daftar tarik tunai',
      description: 'Daftar cash withdrawal dengan filter tanggal dan paginasi.',
      inputSchema: {
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        const data = await listCashWithdrawals(compactQuery(input));
        return ok(data, `${data.items.length} tarik tunai pada halaman ini.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_get_cash_withdrawal',
    {
      title: 'Detail tarik tunai',
      description: 'Ambil satu cash withdrawal berdasarkan ID.',
      inputSchema: {
        cashWithdrawalId: z.number().int().positive(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ cashWithdrawalId }) => {
      try {
        return ok(await getCashWithdrawal(cashWithdrawalId));
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_create_cash_withdrawal',
    {
      title: 'Catat tarik tunai',
      description:
        'Tarik tunai dari account+pocket ke cash. Butuh FAMILY_MCP_ENABLE_WRITE=true.',
      inputSchema: {
        fromAccountId: z.number().int().positive(),
        fromPocketId: z.number().int().positive(),
        amount: z.number().int().positive(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD.'),
        note: z.string().trim().max(500).nullable().optional(),
        attachmentMediaId: z.string().nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      try {
        requireWriteEnabled();
        const payload: MoneyCashWithdrawalCreateInput = {
          fromAccountId: input.fromAccountId,
          fromPocketId: input.fromPocketId,
          amount: input.amount,
          date: input.date,
          note: input.note,
          attachmentMediaId: input.attachmentMediaId,
        };
        const withdrawal = await createCashWithdrawal(payload);
        return ok(
          withdrawal,
          `Tarik tunai Rp${input.amount.toLocaleString('id-ID')} dicatat.`,
        );
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_update_cash_withdrawal',
    {
      title: 'Edit tarik tunai',
      description:
        'Update partial cash withdrawal. Kirim hanya field yang berubah. Butuh FAMILY_MCP_ENABLE_WRITE=true.',
      inputSchema: {
        cashWithdrawalId: z.number().int().positive(),
        fromAccountId: z.number().int().positive().optional(),
        fromPocketId: z.number().int().positive().optional(),
        amount: z.number().int().positive().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD.').optional(),
        note: z.string().trim().max(500).nullable().optional(),
        attachmentMediaId: z.string().nullable().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ cashWithdrawalId, ...input }) => {
      try {
        requireWriteEnabled();
        requireAtLeastOne(
          input,
          'Minimal satu field harus diisi untuk edit tarik tunai.',
        );
        const payload: MoneyCashWithdrawalUpdateInput = {
          fromAccountId: input.fromAccountId,
          fromPocketId: input.fromPocketId,
          amount: input.amount,
          date: input.date,
          note: input.note,
          attachmentMediaId: input.attachmentMediaId,
        };
        const withdrawal = await updateCashWithdrawal(
          cashWithdrawalId,
          payload,
        );
        return ok(withdrawal, `Tarik tunai #${cashWithdrawalId} diperbarui.`);
      } catch (error) {
        return fail(error);
      }
    },
  );

  server.registerTool(
    'money_delete_cash_withdrawal',
    {
      title: 'Hapus tarik tunai',
      description:
        'Hapus cash withdrawal permanen. Butuh FAMILY_MCP_ENABLE_DESTRUCTIVE=true dan konfirmasi eksplisit.',
      inputSchema: {
        cashWithdrawalId: z.number().int().positive(),
        confirm: z
          .string()
          .describe('Kirim "DELETE CASH WITHDRAWAL <cashWithdrawalId>".'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ cashWithdrawalId, confirm }) => {
      try {
        requireDestructiveEnabled();
        requireConfirm(confirm, `DELETE CASH WITHDRAWAL ${cashWithdrawalId}`);
        await deleteCashWithdrawal(cashWithdrawalId);
        return ok(
          { deleted: true, cashWithdrawalId },
          `Tarik tunai #${cashWithdrawalId} dihapus.`,
        );
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

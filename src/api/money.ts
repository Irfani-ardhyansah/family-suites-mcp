import { apiDelete, apiGet, apiPatch, apiPost } from './client.js';

export type MoneyQuery = Record<
  string,
  string | number | boolean | null | undefined
>;

export type MoneyPaginated<T = unknown> = {
  items: T[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
};

export type MoneyTransaction = Record<string, unknown>;
export type MoneyTransfer = Record<string, unknown>;
export type MoneyCashWithdrawal = Record<string, unknown>;
export type MoneyActivity = Record<string, unknown>;
export type MoneyAccount = Record<string, unknown>;
export type MoneyPocket = Record<string, unknown>;
export type MoneyCategory = Record<string, unknown>;
export type MoneyDebt = Record<string, unknown>;
export type MoneyBudget = Record<string, unknown>;

export type MoneyTransactionType =
  | 'income'
  | 'expense'
  | 'opening_balance'
  | 'adjustment';

export type MoneyTransactionCreateInput = {
  pocketId: number;
  type: MoneyTransactionType;
  amount: number;
  date: string;
  categoryId?: number | null;
  note?: string | null;
  attachmentMediaId?: string | null;
};

export type MoneyTransactionUpdateInput = Partial<MoneyTransactionCreateInput>;

export type MoneyTransferKind = 'interpersonal' | 'interpocket';

export type MoneyTransferCreateInput = {
  kind: MoneyTransferKind;
  fromPocketId: number;
  toPocketId: number;
  amount: number;
  date: string;
  note?: string | null;
};

export type MoneyTransferUpdateInput = Partial<MoneyTransferCreateInput>;

export type MoneyCashWithdrawalCreateInput = {
  fromAccountId: number;
  fromPocketId: number;
  amount: number;
  date: string;
  note?: string | null;
  attachmentMediaId?: string | null;
};

export type MoneyCashWithdrawalUpdateInput =
  Partial<MoneyCashWithdrawalCreateInput>;

export function getMoneySetup(): Promise<unknown> {
  return apiGet<unknown>('/money/setup');
}

export function getMoneyDashboard(): Promise<unknown> {
  return apiGet<unknown>('/money/dashboard');
}

export function getMoneyPreferences(): Promise<unknown> {
  return apiGet<unknown>('/money/preferences');
}

export function listAccounts(personId?: number): Promise<MoneyAccount[]> {
  return apiGet<MoneyAccount[]>('/money/accounts', { personId });
}

export function listPockets(input: {
  personId?: number;
  ownerType?: string;
  includeArchived?: boolean;
} = {}): Promise<MoneyPocket[]> {
  return apiGet<MoneyPocket[]>('/money/pockets', {
    personId: input.personId,
    ownerType: input.ownerType,
    includeArchived: input.includeArchived,
  });
}

export function listCategories(input: {
  type?: 'income' | 'expense';
} = {}): Promise<MoneyCategory[]> {
  return apiGet<MoneyCategory[]>('/money/categories', { type: input.type });
}

export function listTransactions(
  input: MoneyQuery = {},
): Promise<MoneyPaginated<MoneyTransaction>> {
  return apiGet<MoneyPaginated<MoneyTransaction>>('/money/transactions', input);
}

export function getTransaction(id: number): Promise<MoneyTransaction> {
  return apiGet<MoneyTransaction>(`/money/transactions/${id}`);
}

export function createTransaction(
  input: MoneyTransactionCreateInput,
): Promise<MoneyTransaction> {
  return apiPost<MoneyTransaction>('/money/transactions', input);
}

export function updateTransaction(
  id: number,
  input: MoneyTransactionUpdateInput,
): Promise<MoneyTransaction> {
  return apiPatch<MoneyTransaction>(`/money/transactions/${id}`, input);
}

export function deleteTransaction(id: number): Promise<{ deleted: true }> {
  return apiDelete<{ deleted: true }>(`/money/transactions/${id}`);
}

export function getTransfer(id: number): Promise<MoneyTransfer> {
  return apiGet<MoneyTransfer>(`/money/transfers/${id}`);
}

export function createTransfer(
  input: MoneyTransferCreateInput,
): Promise<MoneyTransfer> {
  return apiPost<MoneyTransfer>('/money/transfers', input);
}

export function updateTransfer(
  id: number,
  input: MoneyTransferUpdateInput,
): Promise<MoneyTransfer> {
  return apiPatch<MoneyTransfer>(`/money/transfers/${id}`, input);
}

export function deleteTransfer(id: number): Promise<{ deleted: true }> {
  return apiDelete<{ deleted: true }>(`/money/transfers/${id}`);
}

export function listCashWithdrawals(
  input: MoneyQuery = {},
): Promise<MoneyPaginated<MoneyCashWithdrawal>> {
  return apiGet<MoneyPaginated<MoneyCashWithdrawal>>(
    '/money/cash-withdrawals',
    input,
  );
}

export function getCashWithdrawal(id: number): Promise<MoneyCashWithdrawal> {
  return apiGet<MoneyCashWithdrawal>(`/money/cash-withdrawals/${id}`);
}

export function createCashWithdrawal(
  input: MoneyCashWithdrawalCreateInput,
): Promise<MoneyCashWithdrawal> {
  return apiPost<MoneyCashWithdrawal>('/money/cash-withdrawals', input);
}

export function updateCashWithdrawal(
  id: number,
  input: MoneyCashWithdrawalUpdateInput,
): Promise<MoneyCashWithdrawal> {
  return apiPatch<MoneyCashWithdrawal>(
    `/money/cash-withdrawals/${id}`,
    input,
  );
}

export function deleteCashWithdrawal(id: number): Promise<{ deleted: true }> {
  return apiDelete<{ deleted: true }>(`/money/cash-withdrawals/${id}`);
}

export function listActivity(
  input: MoneyQuery = {},
): Promise<MoneyPaginated<MoneyActivity>> {
  return apiGet<MoneyPaginated<MoneyActivity>>('/money/activity', input);
}

export function listDebts(
  input: MoneyQuery = {},
): Promise<MoneyDebt[]> {
  return apiGet<MoneyDebt[]>('/money/debts', input);
}

export function listBudgets(yearMonth: string): Promise<MoneyBudget[]> {
  return apiGet<MoneyBudget[]>('/money/budgets', { yearMonth });
}

export function getMonthlyReport(yearMonth: string): Promise<unknown> {
  return apiGet<unknown>('/money/reports/monthly', { yearMonth });
}

export function listWishlist(): Promise<unknown> {
  return apiGet<unknown>('/money/wishlist');
}

import { apiGet } from './client.js';

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
export type MoneyActivity = Record<string, unknown>;
export type MoneyAccount = Record<string, unknown>;
export type MoneyPocket = Record<string, unknown>;
export type MoneyCategory = Record<string, unknown>;
export type MoneyDebt = Record<string, unknown>;
export type MoneyBudget = Record<string, unknown>;

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

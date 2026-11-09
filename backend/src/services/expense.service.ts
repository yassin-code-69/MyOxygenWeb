/**
 * Operating expenses (SUPER_ADMIN): list with filters and a total, create,
 * update and delete. Amounts are numeric(12,2) in the database and JSON
 * numbers (BDT, 2 decimals) in the API; `incurredOn` is a business date
 * (YYYY-MM-DD, Asia/Dhaka) that may not be in the future.
 *
 * Expenses feed the profit report (net profit = gross profit - expenses whose
 * incurred_on falls in the range). Product cost is never entered here: it is
 * recorded per sale in order_items.unit_cost.
 */
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { expenseCategoryEnum } from "../db/schema/enums";
import { expenses, users } from "../db/schema/tables";
import { todayInBusinessTz } from "../lib/dates";
import { AppError } from "../lib/errors";
import { pageOffset } from "../lib/http";
import type { DbExecutor } from "./db-executor";
import { moneyToNumber, paisaToDecimal, toPaisa } from "./order-pricing";
import { sumMoney } from "./reports/sql";
import { fieldValidationError, toIso } from "./service-utils";

export const EXPENSE_CATEGORIES = expenseCategoryEnum.enumValues;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Expense total for one category within a date range (GET /admin/expenses meta.byCategory). */
export interface ExpenseCategoryTotal {
  category: ExpenseCategory;
  count: number;
  amount: number;
}

export interface ExpenseDTO {
  id: string;
  category: ExpenseCategory;
  amount: number;
  incurredOn: string;
  vendor: string | null;
  note: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseListQuery {
  page: number;
  limit: number;
  from?: string;
  to?: string;
  category?: ExpenseCategory;
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  amount: number;
  incurredOn: string;
  vendor?: string | null;
  note?: string | null;
}

export type UpdateExpenseInput = Partial<CreateExpenseInput>;

const expenseSelection = {
  id: expenses.id,
  category: expenses.category,
  amount: expenses.amount,
  incurredOn: expenses.incurredOn,
  vendor: expenses.vendor,
  note: expenses.note,
  createdAt: expenses.createdAt,
  updatedAt: expenses.updatedAt,
  creatorId: users.id,
  creatorName: users.fullName,
};

type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  amount: string;
  incurredOn: string;
  vendor: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  creatorId: string | null;
  creatorName: string | null;
};

function toExpenseDto(row: ExpenseRow): ExpenseDTO {
  return {
    id: row.id,
    category: row.category,
    amount: moneyToNumber(row.amount),
    incurredOn: row.incurredOn,
    vendor: row.vendor,
    note: row.note,
    createdBy: row.creatorId !== null && row.creatorName !== null ? { id: row.creatorId, fullName: row.creatorName } : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** Service-level guard (the route schema checks it too): no future business dates. */
function assertNotFuture(incurredOn: string | undefined): void {
  if (incurredOn !== undefined && incurredOn > todayInBusinessTz()) {
    throw fieldValidationError({ incurredOn: ["incurredOn must not be in the future"] });
  }
}

function blankToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export class ExpenseService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  async listExpenses(query: ExpenseListQuery): Promise<{
    items: ExpenseDTO[];
    total: number;
    totalAmount: number;
    byCategory: ExpenseCategoryTotal[];
  }> {
    const rangeConditions: SQL[] = [];
    if (query.from) rangeConditions.push(gte(expenses.incurredOn, query.from));
    if (query.to) rangeConditions.push(lte(expenses.incurredOn, query.to));
    const conditions: SQL[] = [...rangeConditions];
    if (query.category) conditions.push(eq(expenses.category, query.category));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select(expenseSelection)
      .from(expenses)
      .leftJoin(users, eq(users.id, expenses.createdBy))
      .where(where)
      .orderBy(desc(expenses.incurredOn), desc(expenses.createdAt), desc(expenses.id))
      .limit(query.limit)
      .offset(pageOffset(query.page, query.limit));
    const [totals] = await this.db
      .select({ total: count(), amount: sumMoney(expenses.amount) })
      .from(expenses)
      .where(where);
    // Per-category totals for the date range only (ignoring the category
    // filter), so a breakdown chart stays complete while the list is filtered.
    const categoryRows = await this.db
      .select({ category: expenses.category, count: count(), amount: sumMoney(expenses.amount) })
      .from(expenses)
      .where(rangeConditions.length > 0 ? and(...rangeConditions) : undefined)
      .groupBy(expenses.category);

    return {
      items: rows.map(toExpenseDto),
      total: Number(totals?.total ?? 0),
      totalAmount: moneyToNumber(totals?.amount ?? "0"),
      byCategory: categoryRows
        .map((row) => ({ category: row.category, count: Number(row.count), amount: moneyToNumber(row.amount ?? "0") }))
        .sort((a, b) => b.amount - a.amount),
    };
  }

  async getExpense(id: string): Promise<ExpenseDTO> {
    const [row] = await this.db
      .select(expenseSelection)
      .from(expenses)
      .leftJoin(users, eq(users.id, expenses.createdBy))
      .where(eq(expenses.id, id))
      .limit(1);
    if (!row) throw AppError.notFound("Expense", { id });
    return toExpenseDto(row);
  }

  async createExpense(input: CreateExpenseInput, actorId: string): Promise<ExpenseDTO> {
    assertNotFuture(input.incurredOn);
    const [row] = await this.db
      .insert(expenses)
      .values({
        category: input.category,
        amount: paisaToDecimal(toPaisa(input.amount)),
        incurredOn: input.incurredOn,
        vendor: blankToNull(input.vendor) ?? null,
        note: blankToNull(input.note) ?? null,
        createdBy: actorId,
      })
      .returning({ id: expenses.id });
    if (!row) throw AppError.internal("Expense insert returned no row");
    return this.getExpense(row.id);
  }

  async updateExpense(id: string, input: UpdateExpenseInput): Promise<ExpenseDTO> {
    assertNotFuture(input.incurredOn);
    const changes: Partial<typeof expenses.$inferInsert> = {};
    if (input.category !== undefined) changes.category = input.category;
    if (input.amount !== undefined) changes.amount = paisaToDecimal(toPaisa(input.amount));
    if (input.incurredOn !== undefined) changes.incurredOn = input.incurredOn;
    const vendor = blankToNull(input.vendor);
    if (vendor !== undefined) changes.vendor = vendor;
    const note = blankToNull(input.note);
    if (note !== undefined) changes.note = note;

    if (Object.keys(changes).length === 0) {
      throw fieldValidationError({}, "At least one field must be provided");
    }
    const [row] = await this.db.update(expenses).set(changes).where(eq(expenses.id, id)).returning({ id: expenses.id });
    if (!row) throw AppError.notFound("Expense", { id });
    return this.getExpense(row.id);
  }

  async deleteExpense(id: string): Promise<void> {
    const [row] = await this.db.delete(expenses).where(eq(expenses.id, id)).returning({ id: expenses.id });
    if (!row) throw AppError.notFound("Expense", { id });
  }
}

export const expenseService = new ExpenseService();

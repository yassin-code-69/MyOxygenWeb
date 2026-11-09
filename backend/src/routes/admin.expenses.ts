/**
 * Mounted at /admin in src/index.ts. Expense tracking (SUPER_ADMIN only), see
 * docs/API_CONTRACT.md ("Admin v2"):
 *
 *   GET    /admin/expenses        list (from, to, category, page, limit) — meta.totalAmount + meta.byCategory
 *   POST   /admin/expenses        create → 201 ExpenseDTO
 *   PATCH  /admin/expenses/:id    update any subset → ExpenseDTO
 *   DELETE /admin/expenses/:id    204
 */
import { Hono } from "hono";
import { created, noContent, ok } from "../lib/http";
import { uuidParam, validate } from "../lib/validation";
import { requireAuth, requireRole, type AuthContext } from "../middleware/auth";
import { expenseService } from "../services/expense.service";
import { createExpenseSchema, expenseListQuerySchema, updateExpenseSchema } from "./admin.schema";
import { paginatedWithMeta } from "./admin.reports";

export const adminExpensesRoute = new Hono<AuthContext>();

adminExpensesRoute.get(
  "/expenses",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  validate("query", expenseListQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total, totalAmount, byCategory } = await expenseService.listExpenses(query);
    return paginatedWithMeta(c, items, { page: query.page, limit: query.limit, total }, { totalAmount, byCategory });
  },
);

adminExpensesRoute.post(
  "/expenses",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  validate("json", createExpenseSchema),
  async (c) => {
    return created(c, await expenseService.createExpense(c.req.valid("json"), c.get("user").sub));
  },
);

adminExpensesRoute.patch(
  "/expenses/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  validate("param", uuidParam),
  validate("json", updateExpenseSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await expenseService.updateExpense(id, c.req.valid("json")));
  },
);

adminExpensesRoute.delete(
  "/expenses/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  validate("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    await expenseService.deleteExpense(id);
    return noContent(c);
  },
);

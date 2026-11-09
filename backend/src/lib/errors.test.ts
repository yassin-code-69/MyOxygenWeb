import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { errorHandler, mapError, notFoundHandler } from "../middleware/error-handler";
import { findPgError, isUniqueViolation } from "./db-errors";
import { AppError, ERROR_HTTP_STATUS, ErrorCode } from "./errors";
import { buildPaginationMeta, pageOffset, paginated } from "./http";
import { paginationQuery, uuidParam, uuidParams, validate } from "./validation";

/** Builds an object shaped like node-postgres' DatabaseError. */
function pgError(code: string, extra: { detail?: string; constraint?: string } = {}): Error {
  return Object.assign(new Error(`pg failure ${code} with secret internals`), {
    code,
    severity: "ERROR",
    ...extra,
  });
}

describe("AppError", () => {
  it("uses the default status of each code", () => {
    expect(AppError.notFound("Product").httpStatus).toBe(404);
    expect(AppError.notFound("Product").message).toBe("Product not found");
    expect(AppError.validation().httpStatus).toBe(422);
    expect(AppError.insufficientStock("Only 3 left").httpStatus).toBe(409);
    expect(AppError.invalidCoupon().code).toBe(ErrorCode.INVALID_COUPON);
    expect(AppError.rateLimited(undefined, 5).details).toEqual({ retryAfterSeconds: 5 });
    for (const code of Object.values(ErrorCode)) {
      expect(new AppError(code, "x").httpStatus).toBe(ERROR_HTTP_STATUS[code]);
    }
  });

  it("serialises without cause or stack", () => {
    const err = AppError.invalidStatusTransition("DELIVERED", "PENDING");
    expect(err.toPayload()).toEqual({
      code: "INVALID_STATUS_TRANSITION",
      message: "Cannot change status from DELIVERED to PENDING",
      details: { from: "DELIVERED", to: "PENDING" },
    });
    expect(AppError.internal("boom", new Error("db password=x")).toPayload()).toEqual({
      code: "INTERNAL_ERROR",
      message: "boom",
    });
  });
});

describe("mapError", () => {
  it("maps AppError to its status and payload", () => {
    const mapped = mapError(AppError.conflict("SKU taken", { sku: "A" }));
    expect(mapped.status).toBe(409);
    expect(mapped.body).toEqual({ success: false, error: { code: "CONFLICT", message: "SKU taken", details: { sku: "A" } } });
    expect(mapped.logAsError).toBe(false);
  });

  it("maps HTTPException 400 (malformed JSON) to BAD_REQUEST", () => {
    const mapped = mapError(new HTTPException(400, { message: "Malformed JSON in request body" }));
    expect(mapped.status).toBe(400);
    expect(mapped.body.error).toEqual({ code: "BAD_REQUEST", message: "Malformed JSON in request body" });
  });

  it("maps HTTPException 5xx to a generic message outside development", () => {
    const mapped = mapError(new HTTPException(502, { message: "upstream exploded at 10.0.0.3" }));
    expect(mapped.status).toBe(502);
    expect(mapped.body.error.message).toBe("Internal server error");
  });

  it("maps ZodError to 422 with flattened details", () => {
    const result = z.object({ qty: z.number().int() }).safeParse({ qty: "x" });
    if (result.success) throw new Error("expected failure");
    const mapped = mapError(result.error);
    expect(mapped.status).toBe(422);
    expect(mapped.body.error.code).toBe("VALIDATION_ERROR");
    expect(mapped.body.error.details).toMatchObject({ fieldErrors: { qty: expect.any(Array) } });
  });

  it.each([
    ["23505", {}, 409, "CONFLICT"],
    ["23503", { detail: 'Key (id)=(1) is still referenced from table "orders".' }, 409, "CONFLICT"],
    ["23503", { detail: 'Key (category_id)=(x) is not present in table "categories".' }, 400, "BAD_REQUEST"],
    ["22P02", {}, 400, "BAD_REQUEST"],
    ["23514", { constraint: "batch_available_nonneg_chk" }, 400, "BAD_REQUEST"],
    ["40P01", {}, 409, "CONFLICT"],
    ["57014", {}, 503, "SERVICE_UNAVAILABLE"],
    ["08006", {}, 503, "SERVICE_UNAVAILABLE"],
  ] as const)("maps Postgres %s to %i", (code, extra, status, errorCode) => {
    const mapped = mapError(pgError(code, extra));
    expect(mapped.status).toBe(status);
    expect(mapped.body.error.code).toBe(errorCode);
    expect(mapped.body.error.message).not.toContain("secret internals");
    // NODE_ENV=test: no SQL state / constraint names leak.
    expect(mapped.body.error.details).toBeUndefined();
  });

  it("finds Postgres errors wrapped in a cause chain", () => {
    const wrapped = new Error("Failed query", { cause: pgError("23505", { constraint: "products_sku_unique" }) });
    expect(findPgError(wrapped)?.code).toBe("23505");
    expect(isUniqueViolation(wrapped, "products_sku_unique")).toBe(true);
    expect(isUniqueViolation(wrapped, "other_constraint")).toBe(false);
    expect(mapError(wrapped).status).toBe(409);
  });

  it("maps unknown Postgres errors and plain errors to a generic 500", () => {
    const unknownPg = mapError(pgError("42P01"));
    expect(unknownPg.status).toBe(500);
    expect(unknownPg.body.error).toEqual({ code: "INTERNAL_ERROR", message: "Internal server error" });
    expect(unknownPg.logAsError).toBe(true);

    const plain = mapError(new Error("TypeError: cannot read secret of undefined"));
    expect(plain.status).toBe(500);
    expect(plain.body.error).toEqual({ code: "INTERNAL_ERROR", message: "Internal server error" });
  });

  it("maps connection failures to 503", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" });
    expect(mapError(refused).status).toBe(503);
  });
});

describe("validate() and shared schemas", () => {
  const app = new Hono();
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  app.get("/items/:id", validate("param", uuidParam), validate("query", paginationQuery), (c) => {
    const { id } = c.req.valid("param");
    const { page, limit } = c.req.valid("query");
    return paginated(c, [{ id }], { page, limit, total: 41 });
  });
  app.get("/boom", () => {
    throw new Error("secret stack");
  });

  it("passes valid input through with coerced pagination defaults", async () => {
    const id = crypto.randomUUID();
    const res = await app.request(`/items/${id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: [{ id }],
      meta: { page: 1, limit: 20, total: 41, totalPages: 3 },
    });
  });

  it("returns 422 with details for invalid params and queries", async () => {
    const res = await app.request("/items/not-a-uuid?page=0&limit=500");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.target).toBe("param");
    expect(body.error.details.fieldErrors.id).toBeDefined();

    const query = await app.request(`/items/${crypto.randomUUID()}?page=0&limit=500`);
    const queryBody = await query.json();
    expect(query.status).toBe(422);
    expect(queryBody.error.details.target).toBe("query");
    expect(Object.keys(queryBody.error.details.fieldErrors).sort()).toEqual(["limit", "page"]);
  });

  it("hides unexpected errors behind INTERNAL_ERROR and 404s unknown routes", async () => {
    const original = console.error;
    console.error = () => undefined;
    try {
      const boom = await app.request("/boom");
      expect(boom.status).toBe(500);
      const text = await boom.text();
      expect(text).not.toContain("secret stack");
    } finally {
      console.error = original;
    }
    const missing = await app.request("/nope");
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("NOT_FOUND");
  });

  it("builds multi-key uuid param schemas", () => {
    const schema = uuidParams("orderId", "itemId");
    expect(schema.safeParse({ orderId: crypto.randomUUID(), itemId: crypto.randomUUID() }).success).toBe(true);
    expect(schema.safeParse({ orderId: "x", itemId: crypto.randomUUID() }).success).toBe(false);
  });

  it("computes pagination helpers", () => {
    expect(buildPaginationMeta(2, 10, 0)).toEqual({ page: 2, limit: 10, total: 0, totalPages: 0 });
    expect(buildPaginationMeta(1, 10, 101).totalPages).toBe(11);
    expect(pageOffset(3, 25)).toBe(50);
  });
});

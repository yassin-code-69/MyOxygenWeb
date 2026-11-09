/**
 * Database handle accepted by services: the root client or a transaction.
 *
 * Services that mutate data run their work through `runInTransaction`:
 * - given the root client it opens a real transaction;
 * - given a transaction it opens a SAVEPOINT inside it, so the work belongs to
 *   the caller's transaction (nothing commits on its own) and a failure only
 *   rolls back the service's own partial writes before the error propagates.
 */
import { PgTransaction } from "drizzle-orm/pg-core";
import type { DatabaseClient, DatabaseTransaction } from "../db/client";

export type DbExecutor = DatabaseClient | DatabaseTransaction;

export function isTransaction(db: DbExecutor): db is DatabaseTransaction {
  return db instanceof PgTransaction;
}

export function runInTransaction<T>(
  db: DbExecutor,
  work: (tx: DatabaseTransaction) => Promise<T>,
): Promise<T> {
  return isTransaction(db) ? db.transaction(work) : db.transaction(work);
}

type QueryThunk = () => PromiseLike<unknown>;
type QueryResults<T extends readonly QueryThunk[]> = { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };

/**
 * Runs independent read queries: in parallel on the pool, sequentially on a
 * transaction (a single pg client must not run overlapping queries).
 */
export async function queryAll<T extends readonly QueryThunk[]>(db: DbExecutor, ...queries: T): Promise<QueryResults<T>> {
  if (!isTransaction(db)) {
    return (await Promise.all(queries.map((query) => query()))) as QueryResults<T>;
  }
  const results: unknown[] = [];
  for (const query of queries) {
    results.push(await query());
  }
  return results as QueryResults<T>;
}

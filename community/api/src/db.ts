/**
 * Accès base minimal, commun à Postgres (production, `pg`) et à PGlite (tests) :
 * les deux acceptent le même SQL paramétré `$1, $2…`.
 */
import pg from "pg";

export type Row = Record<string, unknown>;

export interface Db {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Exécute `fn` dans une transaction (COMMIT si OK, ROLLBACK sinon). */
  transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R>;
}

export function pgDb(pool: pg.Pool): Db {
  return {
    async query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
      return (await pool.query(sql, params)).rows as T[];
    },
    async transaction<R>(fn: (tx: Db) => Promise<R>): Promise<R> {
      const client = await pool.connect();
      const tx: Db = {
        query: async <T = Row>(sql: string, params: unknown[] = []) =>
          (await client.query(sql, params)).rows as T[],
        // Pas de transactions imbriquées : on reste dans la même.
        transaction: (inner) => inner(tx),
      };
      try {
        await client.query("BEGIN");
        const out = await fn(tx);
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

import pg from "pg";
import { config } from "./config.js";

// NUMERIC chega do Postgres como texto; convertemos para number (valores em reais cabem com folga).
pg.types.setTypeParser(1700, (v) => Number(v));
// COUNT/SUM de inteiros (bigint) também viram number.
pg.types.setTypeParser(20, (v) => Number(v));

// O fuso da sessão define o que é "hoje" nos relatórios (padrão: horário de Brasília).
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10, options: `-c timezone=${config.timezone}` });

export type Db = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = [], db: Db = pool) {
  const r = await db.query<T>(text, params);
  return r.rows;
}

/** Executa fn dentro de uma transação; desfaz tudo se algo lançar erro. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

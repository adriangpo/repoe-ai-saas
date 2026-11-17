// Aplica, em ordem, os arquivos .sql de src/db/migrations que ainda não rodaram.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "../db.js";

const pasta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

async function main() {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  const feitas = new Set((await pool.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();

  for (const arquivo of arquivos) {
    if (feitas.has(arquivo)) continue;
    const sql = fs.readFileSync(path.join(pasta, arquivo), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [arquivo]);
      await client.query("COMMIT");
      console.log(`aplicada: ${arquivo}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  console.log("Banco atualizado.");
  await pool.end();
}

main().catch((e) => {
  console.error("Falha na migração:", e.message);
  process.exit(1);
});

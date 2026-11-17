import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { jevConfigured } from "./services/jev.js";

async function main() {
  try {
    await pool.query("SELECT 1");
  } catch (e) {
    console.error("Não foi possível conectar ao PostgreSQL:", (e as Error).message);
    console.error("Confira se o banco está rodando (npm run db:up) e se o .env está preenchido.");
    process.exit(1);
  }
  createApp().listen(config.port, () => {
    console.log(`API do Arara em http://localhost:${config.port}`);
    console.log(jevConfigured() ? "JEV: chave configurada." : "JEV: sem chave, o assistente de reposição usará as regras locais.");
  });
}

main();

import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

// O .env fica na raiz do repositório (um nível acima de server/).
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(raiz, ".env"), quiet: true });

function montarDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { DB_USER = "arara", DB_PASSWORD = "", DB_HOST = "localhost", DB_PORT = "5433", DB_NAME = "arara" } = process.env;
  return `postgres://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

let jwtSecret = process.env.JWT_SECRET ?? "";
if (!jwtSecret || jwtSecret.startsWith("troque")) {
  // Sem segredo configurado: gera um aleatório só para esta execução.
  // Os logins expiram quando o servidor reinicia, mas nada fica exposto.
  jwtSecret = randomBytes(32).toString("hex");
  if (process.env.NODE_ENV !== "test") {
    console.warn("[config] JWT_SECRET não definido no .env; usando um segredo temporário.");
  }
}

export const config = {
  raiz,
  port: Number(process.env.PORT) || 3333,
  databaseUrl: montarDatabaseUrl(),
  jwtSecret,
  jevKey: process.env.OPENROUTER_API_KEY || process.env.JEV_API_KEY || "",
  jevUrl: process.env.JEV_URL || "https://openrouter.ai/api/v1/systemone",
  timezone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
  jevTimeoutMs: Number(process.env.JEV_TIMEOUT_MS) || 30000,
};

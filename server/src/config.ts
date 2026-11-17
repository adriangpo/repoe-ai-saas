import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import dotenv from "dotenv";

// O .env fica na raiz do repositório (um nível acima de server/).
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
dotenv.config({ path: path.join(raiz, ".env"), quiet: true });

function montarDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { DB_USER = "repoeai", DB_PASSWORD = "", DB_HOST = "localhost", DB_PORT = "5433", DB_NAME = "repoeai" } = process.env;
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

// Chave do JEV: aceita a da OpenRouter (sk-or-...) ou a chave direta da TypeSafe.
// O endpoint é escolhido conforme a chave, a menos que JEV_URL seja informado.
const jevKey = (process.env.OPENROUTER_API_KEY || process.env.JEV_API_KEY || "").trim();
const usaOpenRouter = jevKey.startsWith("sk-or-") || !!process.env.OPENROUTER_API_KEY;
const jevProvider = usaOpenRouter ? "OpenRouter" : "TypeSafe";
const jevUrl =
  process.env.JEV_URL || (usaOpenRouter ? "https://openrouter.ai/api/v1/systemone" : "https://api.typesafe.ai/v1/systemone");

export const config = {
  raiz,
  port: Number(process.env.PORT) || 3333,
  databaseUrl: montarDatabaseUrl(),
  jwtSecret,
  jevKey,
  jevUrl,
  jevProvider,
  timezone: process.env.APP_TIMEZONE || "America/Sao_Paulo",
  jevTimeoutMs: Number(process.env.JEV_TIMEOUT_MS) || 30000,
};

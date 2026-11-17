// Prepara o ambiente local em um comando:
// 1. cria o .env (com senha do banco e segredo do login aleatórios) se ele não existir;
// 2. sobe o PostgreSQL no Docker;
// 3. cria as tabelas e a loja de demonstração.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (!fs.existsSync(".env")) {
  const env = fs
    .readFileSync(".env.example", "utf8")
    .replace(/^DB_PASSWORD=.*$/m, `DB_PASSWORD=${randomBytes(12).toString("hex")}`)
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomBytes(32).toString("hex")}`);
  fs.writeFileSync(".env", env);
  console.log("Arquivo .env criado com senhas aleatórias.");
} else {
  console.log("Usando o .env existente.");
}

const usaBancoProprio = /^DATABASE_URL=/m.test(fs.readFileSync(".env", "utf8"));
if (!usaBancoProprio) {
  console.log("Subindo o PostgreSQL no Docker...");
  run("docker compose up -d --wait db");
}
run("npm run db:migrate");
run("npm run db:seed");
console.log("\nPronto! Rode `npm run dev` e abra http://localhost:5173");

import { Router } from "express";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { checkPassword, hashPassword, me, requireAuth, signToken } from "../auth.js";
import { HttpError } from "../errors.js";
import { getPlan } from "../plans.js";

export const authRouter = Router();

const signupSchema = z.object({
  storeName: z.string().trim().min(2, "informe o nome da loja").max(80),
  name: z.string().trim().min(2, "informe seu nome").max(80),
  email: z.string().trim().toLowerCase().email("e-mail inválido"),
  password: z.string().min(6, "a senha precisa ter pelo menos 6 caracteres").max(72),
});

// Cadastro de uma nova loja (novo cliente do SaaS) com o usuário dono.
authRouter.post("/signup", async (req, res) => {
  const data = signupSchema.parse(req.body);
  const hash = await hashPassword(data.password);
  const user = await transaction(async (c) => {
    const existe = await query("SELECT 1 FROM users WHERE email = $1", [data.email], c);
    if (existe.length) throw new HttpError(409, "Este e-mail já está cadastrado.");
    const [store] = await query<{ id: number }>("INSERT INTO stores (name) VALUES ($1) RETURNING id", [data.storeName], c);
    const [u] = await query<{ id: number }>(
      "INSERT INTO users (store_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'dono') RETURNING id",
      [store.id, data.name, data.email, hash],
      c,
    );
    return { userId: u.id, storeId: store.id, role: "dono" as const };
  });
  res.status(201).json({ token: signToken(user) });
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("e-mail inválido"),
  password: z.string().min(1, "informe a senha"),
});

authRouter.post("/login", async (req, res) => {
  const data = loginSchema.parse(req.body);
  const [u] = await query("SELECT id, store_id, role, password_hash FROM users WHERE email = $1", [data.email]);
  if (!u || !(await checkPassword(data.password, u.password_hash))) {
    throw new HttpError(401, "E-mail ou senha incorretos.");
  }
  res.json({ token: signToken({ userId: u.id, storeId: u.store_id, role: u.role }) });
});

// Dados do usuário logado, da loja e do plano (usado pela interface ao abrir).
authRouter.get("/me", requireAuth, async (req, res) => {
  const { userId, storeId } = me(req);
  const [row] = await query(
    `SELECT u.id, u.name, u.email, u.role, s.id AS store_id, s.name AS store_name, s.plan
       FROM users u JOIN stores s ON s.id = u.store_id
      WHERE u.id = $1 AND s.id = $2`,
    [userId, storeId],
  );
  if (!row) throw new HttpError(401, "Usuário não encontrado.");
  const plan = getPlan(row.plan);
  res.json({
    user: { id: row.id, name: row.name, email: row.email, role: row.role },
    store: { id: row.store_id, name: row.store_name },
    plan: { id: plan.id, name: plan.name, jevAssistant: plan.jevAssistant },
  });
});

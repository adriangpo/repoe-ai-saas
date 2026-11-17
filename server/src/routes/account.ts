import { Router } from "express";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { hashPassword, me, requireRole } from "../auth.js";
import { HttpError } from "../errors.js";
import { getPlan, PLANS, withinLimit } from "../plans.js";
import { jevConfigured } from "../services/jev.js";

// Equipe (usuários da loja) e assinatura (plano).
export const accountRouter = Router();

accountRouter.get("/team", async (req, res) => {
  const { storeId } = me(req);
  const rows = await query("SELECT id, name, email, role, created_at FROM users WHERE store_id = $1 ORDER BY role, name", [storeId]);
  res.json(rows);
});

const memberSchema = z.object({
  name: z.string().trim().min(2, "informe o nome").max(80),
  email: z.string().trim().toLowerCase().email("e-mail inválido"),
  password: z.string().min(6, "a senha precisa ter pelo menos 6 caracteres").max(72),
});

accountRouter.post("/team", requireRole("dono"), async (req, res) => {
  const { storeId } = me(req);
  const data = memberSchema.parse(req.body);
  const hash = await hashPassword(data.password);
  await transaction(async (c) => {
    const [store] = await query("SELECT plan FROM stores WHERE id = $1 FOR UPDATE", [storeId], c);
    const plan = getPlan(store.plan);
    const [{ total }] = await query("SELECT COUNT(*) AS total FROM users WHERE store_id = $1", [storeId], c);
    if (!withinLimit(plan.maxUsers, total)) {
      throw new HttpError(402, `O plano ${plan.name} permite ${plan.maxUsers} usuário(s). Faça upgrade para adicionar vendedores.`, {
        codigo: "limite_plano",
      });
    }
    const existe = await query("SELECT 1 FROM users WHERE email = $1", [data.email], c);
    if (existe.length) throw new HttpError(409, "Este e-mail já está cadastrado.");
    await query("INSERT INTO users (store_id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,'vendedor')", [
      storeId,
      data.name,
      data.email,
      hash,
    ], c);
  });
  res.status(201).json({ ok: true });
});

accountRouter.get("/plan", async (req, res) => {
  const { storeId } = me(req);
  const [store] = await query("SELECT plan FROM stores WHERE id = $1", [storeId]);
  const [uso] = await query(
    `SELECT (SELECT COUNT(*) FROM users WHERE store_id = $1) AS usuarios,
            (SELECT COUNT(*) FROM variants WHERE store_id = $1) AS variantes`,
    [storeId],
  );
  res.json({ atual: getPlan(store.plan).id, planos: Object.values(PLANS), uso, jevConfigurado: jevConfigured() });
});

// Troca de plano. No MVP é simulada: em produção, passaria por um gateway de pagamento
// (o webhook de pagamento aprovado é que mudaria o plano).
accountRouter.put("/plan", requireRole("dono"), async (req, res) => {
  const { storeId } = me(req);
  const { plan } = z.object({ plan: z.enum(["basico", "profissional"]) }).parse(req.body);
  const novo = PLANS[plan];
  const [uso] = await query(
    `SELECT (SELECT COUNT(*) FROM users WHERE store_id = $1) AS usuarios,
            (SELECT COUNT(*) FROM variants WHERE store_id = $1) AS variantes`,
    [storeId],
  );
  if (!withinLimit(novo.maxUsers, uso.usuarios, 0) || !withinLimit(novo.maxVariants, uso.variantes, 0)) {
    throw new HttpError(409, `A loja usa mais recursos do que o plano ${novo.name} permite.`);
  }
  await query("UPDATE stores SET plan = $1 WHERE id = $2", [plan, storeId]);
  res.json({ ok: true });
});

import { Router } from "express";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { me, requireRole } from "../auth.js";
import { HttpError } from "../errors.js";

export const stockRouter = Router();

const movementSchema = z.object({
  variantId: z.coerce.number().int().positive(),
  type: z.enum(["entrada", "ajuste"]),
  // entrada: quantidade recebida (positiva). ajuste: diferença, pode ser negativa.
  quantity: z.coerce.number().int().refine((n) => n !== 0, "a quantidade não pode ser zero"),
  note: z.string().trim().max(200).default(""),
});

// Entrada de mercadoria ou ajuste de inventário.
stockRouter.post("/movements", requireRole("dono"), async (req, res) => {
  const { storeId, userId } = me(req);
  const data = movementSchema.parse(req.body);
  if (data.type === "entrada" && data.quantity < 0) throw new HttpError(400, "A entrada precisa ter quantidade positiva.");

  const novo = await transaction(async (c) => {
    const [v] = await query("SELECT id, quantity FROM variants WHERE id=$1 AND store_id=$2 FOR UPDATE", [data.variantId, storeId], c);
    if (!v) throw new HttpError(404, "Variante não encontrada.");
    const resultado = v.quantity + data.quantity;
    if (resultado < 0) throw new HttpError(409, `O ajuste deixaria o estoque negativo (atual: ${v.quantity}).`);
    await query("UPDATE variants SET quantity=$1 WHERE id=$2", [resultado, v.id], c);
    await query(
      "INSERT INTO stock_movements (store_id, variant_id, type, quantity, note, user_id) VALUES ($1,$2,$3,$4,$5,$6)",
      [storeId, v.id, data.type, data.quantity, data.note, userId],
      c,
    );
    return resultado;
  });
  res.status(201).json({ quantity: novo });
});

// Variantes em estoque baixo (quantidade <= mínimo).
stockRouter.get("/low", async (req, res) => {
  const { storeId } = me(req);
  const rows = await query(
    `SELECT v.id, v.sku, v.size, v.color, v.quantity, v.min_quantity, p.id AS product_id, p.name AS product_name
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE v.store_id = $1 AND p.active AND v.quantity <= v.min_quantity
      ORDER BY v.quantity, p.name
      LIMIT 50`,
    [storeId],
  );
  res.json(rows);
});

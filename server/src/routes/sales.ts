import { Router } from "express";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { me } from "../auth.js";
import { HttpError } from "../errors.js";

export const salesRouter = Router();

const saleSchema = z.object({
  paymentMethod: z.enum(["dinheiro", "pix", "debito", "credito"]),
  items: z
    .array(z.object({ variantId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(1).max(999) }))
    .min(1, "adicione pelo menos um item"),
});

// Registra uma venda: confere estoque, baixa as quantidades e grava o histórico.
// Tudo em uma transação: ou a venda inteira é registrada, ou nada muda.
salesRouter.post("/", async (req, res) => {
  const { storeId, userId } = me(req);
  const data = saleSchema.parse(req.body);

  // Junta itens repetidos (mesma variante adicionada duas vezes).
  const itens = new Map<number, number>();
  for (const i of data.items) itens.set(i.variantId, (itens.get(i.variantId) ?? 0) + i.quantity);

  const venda = await transaction(async (c) => {
    // FOR UPDATE trava as linhas: duas vendas simultâneas não vendem a mesma última peça.
    const variantes = await query(
      `SELECT v.id, v.quantity, v.size, v.color, p.name, p.price
         FROM variants v JOIN products p ON p.id = v.product_id
        WHERE v.store_id = $1 AND v.id = ANY($2::int[])
        ORDER BY v.id
        FOR UPDATE OF v`,
      [storeId, [...itens.keys()]],
      c,
    );
    if (variantes.length !== itens.size) throw new HttpError(404, "Algum item não pertence a esta loja.");

    const faltando = variantes.filter((v) => v.quantity < itens.get(v.id)!);
    if (faltando.length) {
      const lista = faltando.map((v) => `${v.name} ${v.size}/${v.color} (tem ${v.quantity})`).join(", ");
      throw new HttpError(409, `Estoque insuficiente: ${lista}.`);
    }

    const total = variantes.reduce((soma, v) => soma + v.price * itens.get(v.id)!, 0);
    const [sale] = await query<{ id: number; created_at: string }>(
      "INSERT INTO sales (store_id, user_id, total, payment_method) VALUES ($1,$2,$3,$4) RETURNING id, created_at",
      [storeId, userId, total, data.paymentMethod],
      c,
    );
    for (const v of variantes) {
      const qtd = itens.get(v.id)!;
      await query("INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price) VALUES ($1,$2,$3,$4)", [sale.id, v.id, qtd, v.price], c);
      await query("UPDATE variants SET quantity = quantity - $1 WHERE id = $2", [qtd, v.id], c);
      await query(
        "INSERT INTO stock_movements (store_id, variant_id, type, quantity, note, sale_id, user_id) VALUES ($1,$2,'venda',$3,$4,$5,$6)",
        [storeId, v.id, -qtd, `Venda #${sale.id}`, sale.id, userId],
        c,
      );
    }
    return { id: sale.id, total, createdAt: sale.created_at };
  });
  res.status(201).json(venda);
});

salesRouter.get("/", async (req, res) => {
  const { storeId } = me(req);
  const rows = await query(
    `SELECT s.id, s.total, s.payment_method, s.created_at, u.name AS user_name,
            COALESCE(SUM(si.quantity), 0) AS items
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN sale_items si ON si.sale_id = s.id
      WHERE s.store_id = $1
      GROUP BY s.id, u.name
      ORDER BY s.created_at DESC
      LIMIT 50`,
    [storeId],
  );
  res.json(rows);
});

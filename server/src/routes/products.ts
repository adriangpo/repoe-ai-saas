import { Router } from "express";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { me, requireRole } from "../auth.js";
import { HttpError } from "../errors.js";
import { getPlan, withinLimit } from "../plans.js";

export const productsRouter = Router();

const lista = (max: number) =>
  z
    .array(z.string().trim().min(1).max(20))
    .min(1)
    .max(max)
    .transform((xs) => [...new Set(xs)]);

const productSchema = z.object({
  name: z.string().trim().min(2, "informe o nome").max(80),
  category: z.string().trim().min(2, "informe a categoria").max(40),
  description: z.string().trim().max(300).default(""),
  price: z.coerce.number().min(0),
  cost: z.coerce.number().min(0).default(0),
});

const createSchema = productSchema.extend({
  sizes: lista(10),
  colors: lista(10),
  initialQuantity: z.coerce.number().int().min(0).max(9999).default(0),
  minQuantity: z.coerce.number().int().min(0).max(999).default(2),
});

/** Gera um SKU curto e legível, ex.: CAMI-M-PRE */
function makeSku(name: string, size: string, color: string, productId: number): string {
  const limpa = (s: string, n: number) =>
    s
      .normalize("NFD")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toUpperCase()
      .slice(0, n);
  return `${limpa(name, 4)}${productId}-${limpa(size, 3)}-${limpa(color, 3)}`;
}

// Lista de produtos com totais de estoque.
productsRouter.get("/", async (req, res) => {
  const { storeId } = me(req);
  const busca = typeof req.query.q === "string" ? `%${req.query.q.trim()}%` : "%";
  const rows = await query(
    `SELECT p.id, p.name, p.category, p.price, p.cost, p.active,
            COUNT(v.id)                                         AS variants,
            COALESCE(SUM(v.quantity), 0)                        AS stock,
            COUNT(v.id) FILTER (WHERE v.quantity <= v.min_quantity) AS low_variants
       FROM products p
       LEFT JOIN variants v ON v.product_id = p.id
      WHERE p.store_id = $1 AND (p.name ILIKE $2 OR p.category ILIKE $2)
      GROUP BY p.id
      ORDER BY p.name`,
    [storeId, busca],
  );
  res.json(rows);
});

// Busca de variantes para o PDV (nome do produto, SKU, cor ou tamanho).
productsRouter.get("/variants/search", async (req, res) => {
  const { storeId } = me(req);
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const termos = q.split(/\s+/).filter(Boolean).slice(0, 4);
  // Termos curtos (P, M, GG, 38) são tratados como tamanho exato.
  // Nos demais, a última letra é ignorada para "preta" achar "Preto" e "branca" achar "Branco".
  const params: string[] = [];
  const condicoes = termos.map((t) => {
    if (t.length <= 3) {
      params.push(t);
      return `v.size ILIKE $${params.length + 1}`;
    }
    params.push(`%${t.length > 4 ? t.slice(0, -1) : t}%`);
    const n = params.length + 1;
    return `(p.name ILIKE $${n} OR p.category ILIKE $${n} OR v.sku ILIKE $${n} OR v.color ILIKE $${n})`;
  });
  const rows = await query(
    `SELECT v.id, v.sku, v.size, v.color, v.quantity, p.id AS product_id, p.name AS product_name, p.price
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE v.store_id = $1 AND p.active ${condicoes.length ? "AND " + condicoes.join(" AND ") : ""}
      ORDER BY p.name, v.color, v.id
      LIMIT 30`,
    [storeId, ...params],
  );
  res.json(rows);
});

productsRouter.get("/:id", async (req, res) => {
  const { storeId } = me(req);
  const [product] = await query("SELECT * FROM products WHERE id = $1 AND store_id = $2", [req.params.id, storeId]);
  if (!product) throw new HttpError(404, "Produto não encontrado.");
  const variants = await query(
    `SELECT v.*,
            COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id = si.sale_id
                       WHERE si.variant_id = v.id AND s.created_at >= now() - interval '30 days'), 0) AS sold30
       FROM variants v WHERE v.product_id = $1
      ORDER BY v.color, v.id`,
    [product.id],
  );
  const movements = await query(
    `SELECT m.id, m.type, m.quantity, m.note, m.created_at, v.size, v.color, u.name AS user_name
       FROM stock_movements m
       JOIN variants v ON v.id = m.variant_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE v.product_id = $1
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT 15`,
    [product.id],
  );
  res.json({ ...product, variants, movements });
});

// Cria o produto e toda a grade (tamanhos x cores) de uma vez.
productsRouter.post("/", requireRole("dono"), async (req, res) => {
  const { storeId, userId } = me(req);
  const data = createSchema.parse(req.body);
  const id = await transaction(async (c) => {
    const [store] = await query("SELECT plan FROM stores WHERE id = $1", [storeId], c);
    const plan = getPlan(store.plan);
    const [{ total }] = await query("SELECT COUNT(*) AS total FROM variants WHERE store_id = $1", [storeId], c);
    const novas = data.sizes.length * data.colors.length;
    if (!withinLimit(plan.maxVariants, total, novas)) {
      throw new HttpError(402, `O plano ${plan.name} permite até ${plan.maxVariants} variantes. Faça upgrade para cadastrar mais.`, {
        codigo: "limite_plano",
      });
    }
    const [p] = await query<{ id: number }>(
      "INSERT INTO products (store_id, name, category, description, price, cost) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [storeId, data.name, data.category, data.description, data.price, data.cost],
      c,
    );
    for (const color of data.colors) {
      for (const size of data.sizes) {
        const [v] = await query<{ id: number }>(
          `INSERT INTO variants (store_id, product_id, size, color, sku, quantity, min_quantity)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [storeId, p.id, size, color, makeSku(data.name, size, color, p.id), data.initialQuantity, data.minQuantity],
          c,
        );
        if (data.initialQuantity > 0) {
          await query(
            "INSERT INTO stock_movements (store_id, variant_id, type, quantity, note, user_id) VALUES ($1,$2,'entrada',$3,'Estoque inicial',$4)",
            [storeId, v.id, data.initialQuantity, userId],
            c,
          );
        }
      }
    }
    return p.id;
  });
  res.status(201).json({ id });
});

productsRouter.put("/:id", requireRole("dono"), async (req, res) => {
  const { storeId } = me(req);
  const data = productSchema.extend({ active: z.boolean().default(true) }).parse(req.body);
  const rows = await query(
    `UPDATE products SET name=$1, category=$2, description=$3, price=$4, cost=$5, active=$6
      WHERE id=$7 AND store_id=$8 RETURNING id`,
    [data.name, data.category, data.description, data.price, data.cost, data.active, req.params.id, storeId],
  );
  if (!rows.length) throw new HttpError(404, "Produto não encontrado.");
  res.json({ ok: true });
});

// Altera o estoque mínimo de uma variante.
productsRouter.patch("/variants/:variantId", requireRole("dono"), async (req, res) => {
  const { storeId } = me(req);
  const { minQuantity } = z.object({ minQuantity: z.coerce.number().int().min(0).max(999) }).parse(req.body);
  const rows = await query("UPDATE variants SET min_quantity=$1 WHERE id=$2 AND store_id=$3 RETURNING id", [
    minQuantity,
    req.params.variantId,
    storeId,
  ]);
  if (!rows.length) throw new HttpError(404, "Variante não encontrada.");
  res.json({ ok: true });
});

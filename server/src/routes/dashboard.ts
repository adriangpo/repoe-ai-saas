import { Router } from "express";
import { query } from "../db.js";
import { me } from "../auth.js";

export const dashboardRouter = Router();

dashboardRouter.get("/", async (req, res) => {
  const { storeId } = me(req);

  const [resumo] = await query(
    `SELECT
       COALESCE(SUM(total) FILTER (WHERE created_at >= date_trunc('day', now())), 0)        AS vendas_hoje,
       COUNT(*)           FILTER (WHERE created_at >= date_trunc('day', now()))             AS qtd_vendas_hoje,
       COALESCE(SUM(total) FILTER (WHERE created_at >= now() - interval '30 days'), 0)      AS vendas_30d,
       COUNT(*)           FILTER (WHERE created_at >= now() - interval '30 days')           AS qtd_vendas_30d
     FROM sales WHERE store_id = $1`,
    [storeId],
  );

  const [estoque] = await query(
    `SELECT COALESCE(SUM(v.quantity), 0)                               AS pecas,
            COALESCE(SUM(v.quantity * p.cost), 0)                      AS valor_custo,
            COUNT(*) FILTER (WHERE v.quantity = 0)                     AS esgotadas,
            COUNT(*) FILTER (WHERE v.quantity > 0 AND v.quantity <= v.min_quantity) AS baixas
       FROM variants v JOIN products p ON p.id = v.product_id
      WHERE v.store_id = $1 AND p.active`,
    [storeId],
  );

  // Faturamento por dia nos últimos 14 dias (inclui dias sem venda).
  const porDia = await query(
    `SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia, COALESCE(SUM(s.total), 0) AS total
       FROM generate_series(date_trunc('day', now()) - interval '13 days', date_trunc('day', now()), interval '1 day') AS d(dia)
       LEFT JOIN sales s ON s.store_id = $1 AND date_trunc('day', s.created_at) = d.dia
      GROUP BY d.dia ORDER BY d.dia`,
    [storeId],
  );

  const maisVendidos = await query(
    `SELECT p.id, p.name, SUM(si.quantity) AS unidades, SUM(si.quantity * si.unit_price) AS receita
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN variants v ON v.id = si.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE s.store_id = $1 AND s.created_at >= now() - interval '30 days'
      GROUP BY p.id ORDER BY unidades DESC LIMIT 5`,
    [storeId],
  );

  res.json({ resumo, estoque, porDia, maisVendidos });
});

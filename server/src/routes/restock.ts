import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { me } from "../auth.js";
import { getPlan } from "../plans.js";
import { askJev, jevConfigured, JevUnavailable } from "../services/jev.js";
import {
  ACOES,
  buildJevPayload,
  needsAttention,
  recommendationFromJev,
  ruleRecommendation,
  type Recommendation,
  type VariantMetrics,
} from "../services/restock.js";

export const restockRouter = Router();

const MAX_ITENS = 15;

/** Calcula as métricas de venda de cada variante ativa da loja. */
async function loadMetrics(storeId: number): Promise<VariantMetrics[]> {
  const rows = await query(
    `SELECT v.id AS variant_id, p.id AS product_id, p.name AS product_name, p.category, p.description,
            v.size, v.color, v.sku, v.quantity, v.min_quantity, p.price,
            EXTRACT(DAY FROM now() - p.created_at)::int AS product_age_days,
            COALESCE(SUM(si.quantity) FILTER (WHERE s.created_at >= now() - interval '30 days'), 0) AS sold30,
            COALESCE(SUM(si.quantity) FILTER (WHERE s.created_at <  now() - interval '30 days'
                                                AND s.created_at >= now() - interval '60 days'), 0) AS sold_prev30,
            EXTRACT(DAY FROM now() - MAX(s.created_at))::int AS days_since_last_sale
       FROM variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN sale_items si ON si.variant_id = v.id
       LEFT JOIN sales s ON s.id = si.sale_id
      WHERE v.store_id = $1 AND p.active
      GROUP BY v.id, p.id`,
    [storeId],
  );
  return rows.map((r) => ({
    variantId: r.variant_id,
    productId: r.product_id,
    productName: r.product_name,
    category: r.category,
    description: r.description,
    size: r.size,
    color: r.color,
    sku: r.sku,
    quantity: r.quantity,
    minQuantity: r.min_quantity,
    price: r.price,
    sold30: r.sold30,
    soldPrev30: r.sold_prev30,
    daysSinceLastSale: r.days_since_last_sale,
    productAgeDays: r.product_age_days,
  }));
}

/** Executa fn para cada item com no máximo `limite` chamadas simultâneas. */
async function mapLimit<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      out[i] = await fn(itens[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return out;
}

const analyzeSchema = z.object({
  observacao: z.string().trim().max(300).default(""),
  modo: z.enum(["auto", "regras"]).default("auto"),
});

restockRouter.post("/analisar", async (req, res) => {
  const { storeId, userId } = me(req);
  const { observacao, modo } = analyzeSchema.parse(req.body ?? {});
  const [store] = await query("SELECT plan FROM stores WHERE id = $1", [storeId]);
  const plan = getPlan(store.plan);

  const metricas = await loadMetrics(storeId);
  const ordenados = metricas
    .filter(needsAttention)
    .map((m) => ({ m, regra: ruleRecommendation(m) }))
    .sort((a, b) => b.regra.urgencia - a.regra.urgencia || b.m.sold30 - a.m.sold30 || b.m.quantity - a.m.quantity);
  // Reserva espaço para peças paradas, para que não sumam atrás das de reposição.
  const repor = ordenados.filter((c) => c.regra.acao !== "promocao").slice(0, MAX_ITENS - 4);
  const parados = ordenados.filter((c) => c.regra.acao === "promocao").slice(0, MAX_ITENS - repor.length);
  const candidatos = [...repor, ...parados];

  // Decide se o JEV pode ser usado; se não, explica o motivo do fallback.
  let motivoFallback: string | null = null;
  if (modo === "regras") motivoFallback = "análise pedida só com regras";
  else if (!plan.jevAssistant) motivoFallback = `o plano ${plan.name} não inclui o assistente com IA`;
  else if (!jevConfigured()) motivoFallback = "chave do JEV não configurada no servidor";

  const hoje = new Date();
  const itens = await mapLimit(candidatos, 4, async ({ m, regra }) => {
    let rec: Recommendation = regra;
    let falha: string | null = null;
    let jev: { enviado: unknown; recebido: unknown } | null = null;
    if (!motivoFallback) {
      const payload = buildJevPayload(m, { hoje, observacao });
      try {
        const answers = await askJev(payload, ["acao", "urgencia"]);
        rec = recommendationFromJev(m, answers);
        jev = { enviado: payload, recebido: answers };
      } catch (e) {
        // Fallback por item: se o JEV falhar para esta peça, vale a regra local.
        falha = e instanceof JevUnavailable ? e.message : (e as Error).message;
      }
    }
    return {
      variante: {
        id: m.variantId,
        productId: m.productId,
        produto: m.productName,
        tamanho: m.size,
        cor: m.color,
        sku: m.sku,
        estoque: m.quantity,
        minimo: m.minQuantity,
        vendidas30: m.sold30,
        vendidasAnt30: m.soldPrev30,
        diasSemVenda: m.daysSinceLastSale,
      },
      recomendacao: { ...rec, acaoNome: ACOES[rec.acao] },
      regra: { acao: regra.acao, acaoNome: ACOES[regra.acao], urgencia: regra.urgencia },
      falhaJev: falha,
      jev,
    };
  });

  // Se todas as consultas falharam pelo mesmo motivo, ele vira o motivo geral.
  const usaramJev = itens.filter((i) => i.recomendacao.fonte === "jev").length;
  if (!motivoFallback && itens.length && usaramJev === 0) motivoFallback = itens[0].falhaJev;
  const fonte = usaramJev === 0 ? "regras" : usaramJev === itens.length ? "jev" : "misto";

  const resultado = {
    fonte,
    motivoFallback,
    plano: plan.name,
    analisadas: metricas.length,
    itens,
    criadoEm: hoje.toISOString(),
  };
  await query("INSERT INTO restock_analyses (store_id, user_id, source, note, result) VALUES ($1,$2,$3,$4,$5)", [
    storeId,
    userId,
    fonte,
    observacao,
    JSON.stringify(resultado),
  ]);
  res.json(resultado);
});

restockRouter.get("/historico", async (req, res) => {
  const { storeId } = me(req);
  const rows = await query(
    `SELECT a.id, a.source, a.note, a.created_at, u.name AS user_name, jsonb_array_length(a.result->'itens') AS itens
       FROM restock_analyses a LEFT JOIN users u ON u.id = a.user_id
      WHERE a.store_id = $1 ORDER BY a.created_at DESC LIMIT 10`,
    [storeId],
  );
  res.json(rows);
});

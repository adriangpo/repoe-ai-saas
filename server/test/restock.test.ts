import { describe, expect, it } from "vitest";
import {
  buildJevPayload,
  coverDays,
  estacao,
  needsAttention,
  recommendationFromJev,
  ruleRecommendation,
  suggestedQuantity,
  type VariantMetrics,
} from "../src/services/restock.js";
import { withinLimit } from "../src/plans.js";

function variante(over: Partial<VariantMetrics> = {}): VariantMetrics {
  return {
    variantId: 1,
    productId: 1,
    productName: "Camiseta básica",
    category: "Camisetas",
    description: "",
    size: "M",
    color: "Preto",
    sku: "CAMI1-M-PRE",
    quantity: 10,
    minQuantity: 2,
    price: 49.9,
    sold30: 6,
    soldPrev30: 5,
    daysSinceLastSale: 2,
    productAgeDays: 90,
    ...over,
  };
}

describe("regras de reposição (fallback)", () => {
  it("peça esgotada que vende vira 'repor agora' com urgência crítica", () => {
    const r = ruleRecommendation(variante({ quantity: 0, sold30: 9 }));
    expect(r.acao).toBe("repor_agora");
    expect(r.urgencia).toBe(3);
    expect(r.quantidadeSugerida).toBe(9); // 30 dias de cobertura no ritmo de 9 un./mês
    expect(r.fonte).toBe("regras");
  });

  it("estoque para menos de uma semana vira 'repor agora'", () => {
    const m = variante({ quantity: 2, sold30: 15 }); // 0,5 por dia -> 4 dias
    expect(coverDays(m)).toBe(4);
    expect(ruleRecommendation(m)).toMatchObject({ acao: "repor_agora", urgencia: 2 });
  });

  it("peça sem venda há mais de 45 dias vira 'promoção'", () => {
    const r = ruleRecommendation(variante({ quantity: 6, sold30: 0, soldPrev30: 1, daysSinceLastSale: 50 }));
    expect(r.acao).toBe("promocao");
    expect(r.quantidadeSugerida).toBe(0);
  });

  it("estoque confortável fica em 'aguardar' e não entra na análise", () => {
    const m = variante({ quantity: 20, sold30: 3 });
    expect(ruleRecommendation(m).acao).toBe("aguardar");
    expect(needsAttention(m)).toBe(false);
  });

  it("quantidade sugerida respeita o estoque mínimo", () => {
    // vende pouco, mas está abaixo do mínimo: compra até mínimo + 1
    expect(suggestedQuantity(variante({ quantity: 1, minQuantity: 4, sold30: 1 }), "repor_pouco")).toBe(4);
  });
});

describe("integração com o JEV", () => {
  const ctx = { hoje: new Date(2026, 10, 16), observacao: "Liquidação em dezembro" };

  it("monta a consulta com Choice e Score", () => {
    const p = buildJevPayload(variante(), ctx);
    expect(p.model).toBe("jev-latest");
    expect(p.questions.acao.type).toBe("choice");
    expect(Object.keys(p.questions.acao.criteria)).toEqual(["repor_agora", "repor_pouco", "aguardar", "promocao"]);
    expect(p.questions.urgencia.type).toBe("score");
    expect(p.state).toContain("primavera");
    expect(p.state).toContain("Liquidação em dezembro");
  });

  it("usa a ação e a urgência devolvidas pelo JEV", () => {
    const r = recommendationFromJev(variante({ quantity: 3, sold30: 12 }), {
      acao: { choice: "repor_agora", probabilities: { repor_agora: 0.85, repor_pouco: 0.15 } },
      urgencia: { score: 2.4 },
    });
    expect(r).toMatchObject({ acao: "repor_agora", urgencia: 2, fonte: "jev", confianca: 0.85, revisar: false });
  });

  it("pede revisão humana quando a confiança é baixa", () => {
    const r = recommendationFromJev(variante(), {
      acao: { choice: "aguardar", probabilities: { aguardar: 0.45 } },
      urgencia: { score: 0 },
    });
    expect(r.revisar).toBe(true);
  });

  it("não aceita promoção de peça esgotada", () => {
    const r = recommendationFromJev(variante({ quantity: 0, sold30: 0 }), {
      acao: { choice: "promocao", probabilities: { promocao: 0.9 } },
      urgencia: { score: 1 },
    });
    expect(r.acao).toBe("repor_pouco");
    expect(r.revisar).toBe(true);
  });

  it("rejeita resposta incompleta (o sistema cai nas regras)", () => {
    expect(() => recommendationFromJev(variante(), { acao: { choice: "xyz" }, urgencia: { score: 1 } })).toThrow();
    expect(() => recommendationFromJev(variante(), { acao: { choice: "aguardar" } })).toThrow();
  });

  it("estações do hemisfério sul", () => {
    expect(estacao(0)).toBe("verão");
    expect(estacao(6)).toBe("inverno");
    expect(estacao(10)).toBe("primavera");
  });
});

describe("limites dos planos", () => {
  it("respeita limite e trata null como ilimitado", () => {
    expect(withinLimit(1, 1)).toBe(false);
    expect(withinLimit(300, 290, 10)).toBe(true);
    expect(withinLimit(300, 295, 10)).toBe(false);
    expect(withinLimit(null, 10_000, 500)).toBe(true);
  });
});

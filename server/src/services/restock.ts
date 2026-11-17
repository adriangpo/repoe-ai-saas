// Regras de negócio do assistente de reposição.
// Este arquivo não acessa banco nem rede: recebe números e devolve decisões.
// É usado de duas formas:
//   1. como fallback completo, quando o JEV não está disponível;
//   2. para calcular a quantidade sugerida a partir da ação escolhida pelo JEV.

export type Acao = "repor_agora" | "repor_pouco" | "aguardar" | "promocao";
export type Fonte = "jev" | "regras";

export const ACOES: Record<Acao, string> = {
  repor_agora: "Repor agora",
  repor_pouco: "Repor com cautela",
  aguardar: "Aguardar",
  promocao: "Fazer promoção",
};

export const URGENCIAS = ["Baixa", "Moderada", "Alta", "Crítica"] as const;

export interface VariantMetrics {
  variantId: number;
  productId: number;
  productName: string;
  category: string;
  description: string;
  size: string;
  color: string;
  sku: string;
  quantity: number;
  minQuantity: number;
  price: number;
  sold30: number; // unidades vendidas nos últimos 30 dias
  soldPrev30: number; // unidades vendidas entre 31 e 60 dias atrás
  daysSinceLastSale: number | null; // null = nunca vendeu
  productAgeDays: number;
}

export interface Recommendation {
  acao: Acao;
  urgencia: number; // 0..3
  quantidadeSugerida: number;
  motivo: string;
  fonte: Fonte;
  confianca: number | null; // só para o JEV
  revisar: boolean; // pede conferência humana
}

const DIAS_ALVO: Record<Acao, number> = { repor_agora: 30, repor_pouco: 15, aguardar: 0, promocao: 0 };

/** Unidades vendidas por dia, com base nos últimos 30 dias. */
export function velocity(m: VariantMetrics): number {
  return m.sold30 / 30;
}

/** Em quantos dias o estoque acaba no ritmo atual (Infinity se não vende). */
export function coverDays(m: VariantMetrics): number {
  const v = velocity(m);
  if (v === 0) return Infinity;
  return m.quantity / v;
}

export function isStalled(m: VariantMetrics): boolean {
  if (m.quantity === 0 || m.sold30 > 0) return false;
  const parado = m.daysSinceLastSale ?? m.productAgeDays;
  return parado >= 45;
}

/** Quantidade a comprar para cobrir os dias-alvo da ação, respeitando o estoque mínimo. */
export function suggestedQuantity(m: VariantMetrics, acao: Acao): number {
  const dias = DIAS_ALVO[acao];
  if (dias === 0) return 0;
  const alvo = Math.max(Math.ceil(velocity(m) * dias), m.minQuantity + 1);
  const falta = alvo - m.quantity;
  const minimo = acao === "repor_agora" ? 2 : 1;
  return Math.max(falta, minimo);
}

/** Decisão por regras fixas (fallback quando o JEV não está disponível). */
export function ruleRecommendation(m: VariantMetrics): Recommendation {
  const cobertura = coverDays(m);
  const base = { fonte: "regras" as const, confianca: null, revisar: false };
  const r = (acao: Acao, urgencia: number, motivo: string): Recommendation => ({
    ...base,
    acao,
    urgencia,
    motivo,
    quantidadeSugerida: suggestedQuantity(m, acao),
  });

  if (m.quantity === 0 && m.sold30 >= 3) {
    return r("repor_agora", 3, `Esgotado e vendeu ${m.sold30} un. nos últimos 30 dias.`);
  }
  if (m.quantity === 0 && m.sold30 > 0) {
    return r("repor_pouco", 2, `Esgotado, mas vendeu só ${m.sold30} un. nos últimos 30 dias.`);
  }
  if (cobertura < 7) {
    const urg = cobertura < 3 ? 3 : 2;
    return r("repor_agora", urg, `O estoque dura cerca de ${Math.max(1, Math.round(cobertura))} dia(s) no ritmo atual.`);
  }
  if (cobertura < 15) {
    return r("repor_pouco", 2, `O estoque dura cerca de ${Math.round(cobertura)} dias no ritmo atual.`);
  }
  if (m.quantity <= m.minQuantity && m.sold30 > 0) {
    return r("repor_pouco", 1, `Chegou ao estoque mínimo (${m.quantity}/${m.minQuantity}).`);
  }
  if (isStalled(m)) {
    const dias = m.daysSinceLastSale ?? m.productAgeDays;
    return r("promocao", 1, `${m.quantity} un. paradas: nenhuma venda há ${dias} dias.`);
  }
  if (m.quantity === 0) {
    return r("aguardar", 0, "Sem estoque, mas também sem vendas recentes.");
  }
  return r("aguardar", 0, Number.isFinite(cobertura) ? `Estoque para cerca de ${Math.round(cobertura)} dias.` : "Estoque estável.");
}

/** Itens que merecem aparecer na análise (os demais estão tranquilos). */
export function needsAttention(m: VariantMetrics): boolean {
  return ruleRecommendation(m).acao !== "aguardar" || (m.quantity <= m.minQuantity && m.sold30 > 0);
}

// ---------------------------------------------------------------------------
// Integração com o JEV: montagem da pergunta e interpretação da resposta.
// ---------------------------------------------------------------------------

export const JEV_CRITERIOS_ACAO: Record<Acao, string> = {
  repor_agora: "Repor agora: a peça vende bem e o estoque acaba em poucos dias ou já acabou",
  repor_pouco: "Repor com cautela: comprar poucas unidades, porque a procura é moderada ou incerta",
  aguardar: "Aguardar: o estoque atual é suficiente para as próximas semanas",
  promocao: "Fazer promoção: a peça está parada ou fora de estação e o estoque precisa girar",
};

export const JEV_CRITERIOS_URGENCIA = [
  "Baixa: pode esperar mais de um mês",
  "Moderada: resolver nas próximas semanas",
  "Alta: resolver nesta semana para não perder vendas",
  "Crítica: resolver hoje, a peça já está faltando ou parada causando prejuízo",
];

const ESTACOES = ["verão", "verão", "outono", "outono", "outono", "inverno", "inverno", "inverno", "primavera", "primavera", "primavera", "verão"];

/** Estação no Brasil (hemisfério sul) para o mês 0..11. */
export function estacao(mes: number): string {
  return ESTACOES[mes];
}

export interface JevContext {
  hoje: Date;
  observacao?: string;
}

export function buildJevState(m: VariantMetrics, ctx: JevContext): string {
  const mes = ctx.hoje.getMonth();
  const cobertura = coverDays(m);
  const partes = [
    `Loja de roupas no Brasil. Hoje é ${ctx.hoje.toLocaleDateString("pt-BR")}; estação atual: ${estacao(mes)}; próxima estação: ${estacao((mes + 3) % 12)}.`,
    `Peça: ${m.productName} (categoria ${m.category}), tamanho ${m.size}, cor ${m.color}.`,
    m.description ? `Descrição: ${m.description}.` : "",
    `Estoque atual: ${m.quantity} un.; estoque mínimo definido pela loja: ${m.minQuantity} un.`,
    `Vendas nos últimos 30 dias: ${m.sold30} un.; nos 30 dias anteriores: ${m.soldPrev30} un.`,
    m.daysSinceLastSale === null ? "Esta variante nunca foi vendida." : `Última venda há ${m.daysSinceLastSale} dia(s).`,
    m.quantity === 0
      ? "A peça está esgotada."
      : Number.isFinite(cobertura)
        ? `No ritmo atual, o estoque dura cerca de ${Math.round(cobertura)} dias.`
        : "No ritmo atual, o estoque não gira.",
    ctx.observacao ? `Observação do dono da loja: ${ctx.observacao}` : "",
  ];
  return partes.filter(Boolean).join(" ");
}

export function buildJevPayload(m: VariantMetrics, ctx: JevContext) {
  return {
    model: "jev-latest",
    state: buildJevState(m, ctx),
    questions: {
      acao: {
        type: "choice",
        instructions: "Qual a melhor ação para esta peça no estoque da loja?",
        criteria: JEV_CRITERIOS_ACAO,
      },
      urgencia: {
        type: "score",
        instructions: "Qual a urgência dessa ação?",
        criteria: JEV_CRITERIOS_URGENCIA,
      },
    },
  };
}

export interface JevAnswers {
  acao?: { choice?: string; probabilities?: Record<string, number> };
  urgencia?: { score?: number | string };
}

/** Converte a resposta do JEV em recomendação; lança erro se vier incompleta. */
export function recommendationFromJev(m: VariantMetrics, answers: JevAnswers): Recommendation {
  const choice = answers.acao?.choice as Acao | undefined;
  if (!choice || !(choice in ACOES)) throw new Error("JEV retornou uma ação desconhecida");
  const score = Number(answers.urgencia?.score);
  if (!Number.isFinite(score)) throw new Error("JEV não retornou a urgência");

  const urgencia = Math.min(3, Math.max(0, Math.round(score)));
  const prob = answers.acao?.probabilities?.[choice];
  const confianca = typeof prob === "number" ? prob : null;
  const regra = ruleRecommendation(m);

  // Trava de segurança: nunca sugerir promoção de algo que está esgotado.
  const acao: Acao = choice === "promocao" && m.quantity === 0 ? "repor_pouco" : choice;

  return {
    acao,
    urgencia,
    quantidadeSugerida: suggestedQuantity(m, acao),
    motivo: regra.acao === acao ? regra.motivo : `JEV sugere "${ACOES[acao]}"; pelas regras seria "${ACOES[regra.acao]}".`,
    fonte: "jev",
    confianca,
    revisar: (confianca !== null && confianca < 0.6) || acao !== choice,
  };
}

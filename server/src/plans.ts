// Planos de assinatura do SaaS. Os limites são aplicados pela API.

export type PlanId = "basico" | "profissional";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  maxUsers: number | null; // null = sem limite
  maxVariants: number | null;
  jevAssistant: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  basico: {
    id: "basico",
    name: "Básico",
    priceMonthly: 49.9,
    maxUsers: 1,
    maxVariants: 300,
    jevAssistant: false,
    features: [
      "1 usuário (dono)",
      "Até 300 variantes (tamanho + cor)",
      "Venda no balcão com baixa automática",
      "Alertas de estoque baixo",
      "Reposição sugerida por regras",
    ],
  },
  profissional: {
    id: "profissional",
    name: "Profissional",
    priceMonthly: 99.9,
    maxUsers: 5,
    maxVariants: null,
    jevAssistant: true,
    features: [
      "Até 5 usuários (dono + vendedores)",
      "Variantes ilimitadas",
      "Tudo do plano Básico",
      "Assistente de reposição com IA (JEV)",
      "Histórico das análises de reposição",
    ],
  },
};

export function getPlan(id: string): Plan {
  return PLANS[id as PlanId] ?? PLANS.basico;
}

/** true se ainda cabe mais `adding` itens no limite (null = ilimitado). */
export function withinLimit(limit: number | null, current: number, adding = 1): boolean {
  return limit === null || current + adding <= limit;
}

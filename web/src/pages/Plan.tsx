import { useState } from "react";
import { api, brl } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, useApi } from "../components/ui";

interface Plano {
  id: "basico" | "profissional";
  name: string;
  priceMonthly: number;
  maxUsers: number | null;
  maxVariants: number | null;
  jevAssistant: boolean;
  features: string[];
}

interface PlanInfo {
  atual: Plano["id"];
  planos: Plano[];
  uso: { usuarios: number; variantes: number };
  jevConfigurado: boolean;
}

const limite = (n: number | null) => (n === null ? "ilimitado" : n);

export function PlanPage() {
  const { session, refresh } = useAuth();
  const { data, error, reload } = useApi<PlanInfo>("/account/plan");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const dono = session?.user.role === "dono";

  async function mudar(plan: Plano["id"]) {
    setErro(null);
    setOk(null);
    try {
      await api("/account/plan", { method: "PUT", body: { plan } });
      await Promise.all([reload(), refresh()]);
      setOk("Plano alterado. Na versão comercial, a troca é confirmada após o pagamento.");
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!data) return <p>Carregando…</p>;
  const atual = data.planos.find((p) => p.id === data.atual)!;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Plano e assinatura</h1>
          <p className="muted">Cobrança mensal, sem fidelidade. Os limites do plano são aplicados pelo sistema.</p>
        </div>
      </div>
      <ErrorBox error={erro} />
      {ok && <div className="alert ok">{ok}</div>}

      <div className="grid k3">
        <div className="card kpi">
          <div className="label">Plano atual</div>
          <div className="value">{atual.name}</div>
          <div className="sub">{brl(atual.priceMonthly)}/mês</div>
        </div>
        <div className="card kpi">
          <div className="label">Usuários</div>
          <div className="value">{data.uso.usuarios} / {limite(atual.maxUsers)}</div>
        </div>
        <div className="card kpi">
          <div className="label">Variantes cadastradas</div>
          <div className="value">{data.uso.variantes} / {limite(atual.maxVariants)}</div>
        </div>
      </div>

      <div className="grid k3">
        {data.planos.map((p) => (
          <div key={p.id} className={`card plan ${p.id === data.atual ? "current" : ""}`}>
            <h2 style={{ margin: 0 }}>{p.name}</h2>
            <div className="price">{brl(p.priceMonthly)}<span className="small muted">/mês</span></div>
            <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            {p.id === data.atual ? (
              <span className="badge brand">Plano atual</span>
            ) : (
              dono && <button onClick={() => mudar(p.id)}>Mudar para {p.name}</button>
            )}
          </div>
        ))}
        <div className="card plan">
          <h2 style={{ margin: 0 }}>Rede</h2>
          <div className="price">Sob consulta</div>
          <ul>
            <li>Várias lojas na mesma conta</li>
            <li>Transferência de estoque entre lojas</li>
            <li>Relatórios consolidados</li>
          </ul>
          <span className="badge">Em breve</span>
        </div>
      </div>
      {atual.jevAssistant && !data.jevConfigurado && (
        <div className="alert warn">A chave do JEV não está configurada neste servidor: o assistente de reposição está usando as regras locais.</div>
      )}
    </div>
  );
}

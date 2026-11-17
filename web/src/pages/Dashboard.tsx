import { Link } from "react-router-dom";
import { brl } from "../api";
import { ErrorBox, StockBadge, useApi } from "../components/ui";

interface Dashboard {
  resumo: { vendas_hoje: number; qtd_vendas_hoje: number; vendas_30d: number; qtd_vendas_30d: number };
  estoque: { pecas: number; valor_custo: number; esgotadas: number; baixas: number };
  porDia: { dia: string; total: number }[];
  maisVendidos: { id: number; name: string; unidades: number; receita: number }[];
}

interface Baixo {
  id: number;
  product_id: number;
  product_name: string;
  size: string;
  color: string;
  quantity: number;
  min_quantity: number;
}

export function DashboardPage() {
  const { data, error } = useApi<Dashboard>("/dashboard");
  const baixos = useApi<Baixo[]>("/stock/low");

  if (error) return <ErrorBox error={error} />;
  if (!data) return <p>Carregando…</p>;
  const max = Math.max(1, ...data.porDia.map((d) => d.total));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Painel</h1>
          <p className="muted">Resumo das vendas e do estoque da loja.</p>
        </div>
        <Link to="/vender" className="btn">+ Nova venda</Link>
      </div>

      <div className="grid k4">
        <div className="card kpi">
          <div className="label">Vendas hoje</div>
          <div className="value">{brl(data.resumo.vendas_hoje)}</div>
          <div className="sub">{data.resumo.qtd_vendas_hoje} venda(s)</div>
        </div>
        <div className="card kpi">
          <div className="label">Últimos 30 dias</div>
          <div className="value">{brl(data.resumo.vendas_30d)}</div>
          <div className="sub">{data.resumo.qtd_vendas_30d} vendas</div>
        </div>
        <div className="card kpi">
          <div className="label">Peças em estoque</div>
          <div className="value">{data.estoque.pecas}</div>
          <div className="sub">{brl(data.estoque.valor_custo)} a preço de custo</div>
        </div>
        <div className="card kpi">
          <div className="label">Precisam de atenção</div>
          <div className="value" style={{ color: data.estoque.esgotadas ? "var(--danger)" : undefined }}>
            {data.estoque.esgotadas + data.estoque.baixas}
          </div>
          <div className="sub">
            {data.estoque.esgotadas} esgotadas · {data.estoque.baixas} com estoque baixo
          </div>
        </div>
      </div>

      <div className="grid k2">
        <div className="card">
          <h2>Faturamento dos últimos 14 dias</h2>
          <div className="bars" role="img" aria-label="Gráfico de faturamento diário">
            {data.porDia.map((d) => (
              <div className="bar" key={d.dia} title={`${d.dia.split("-").reverse().join("/")}: ${brl(d.total)}`}>
                <span style={{ height: `${(d.total / max) * 100}%` }} />
                <small>{d.dia.slice(8)}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Mais vendidos (30 dias)</h2>
          <table>
            <thead>
              <tr><th>Produto</th><th className="num">Unid.</th><th className="num">Receita</th></tr>
            </thead>
            <tbody>
              {data.maisVendidos.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/produtos/${p.id}`}>{p.name}</Link></td>
                  <td className="num">{p.unidades}</td>
                  <td className="num">{brl(p.receita)}</td>
                </tr>
              ))}
              {!data.maisVendidos.length && <tr><td colSpan={3} className="muted">Nenhuma venda ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="page-head" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Estoque baixo ou esgotado</h2>
          <Link to="/reposicao">Analisar reposição →</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Produto</th><th>Tamanho</th><th>Cor</th><th className="num">Estoque</th><th className="num">Mínimo</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {(baixos.data ?? []).map((v) => (
                <tr key={v.id}>
                  <td><Link to={`/produtos/${v.product_id}`}>{v.product_name}</Link></td>
                  <td>{v.size}</td>
                  <td>{v.color}</td>
                  <td className="num">{v.quantity}</td>
                  <td className="num">{v.min_quantity}</td>
                  <td><StockBadge quantity={v.quantity} min={v.min_quantity} /></td>
                </tr>
              ))}
              {baixos.data && !baixos.data.length && <tr><td colSpan={6} className="muted">Tudo certo: nenhuma peça abaixo do mínimo.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

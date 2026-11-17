import { useState } from "react";
import { Link } from "react-router-dom";
import { brl } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, useApi } from "../components/ui";

interface ProdutoLista {
  id: number;
  name: string;
  category: string;
  price: number;
  active: boolean;
  variants: number;
  stock: number;
  low_variants: number;
}

export function ProductsPage() {
  const { session } = useAuth();
  const [q, setQ] = useState("");
  const { data, error } = useApi<ProdutoLista[]>(`/products?q=${encodeURIComponent(q)}`);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Produtos e estoque</h1>
          <p className="muted">Cada produto tem uma grade de variantes (tamanho + cor) com estoque próprio.</p>
        </div>
        {session?.user.role === "dono" && <Link to="/produtos/novo" className="btn">+ Novo produto</Link>}
      </div>
      <ErrorBox error={error} />
      <div className="card">
        <input placeholder="Buscar por nome ou categoria" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360, marginBottom: 8 }} aria-label="Buscar produto" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Produto</th><th>Categoria</th><th className="num">Preço</th><th className="num">Variantes</th><th className="num">Peças</th><th>Alertas</th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/produtos/${p.id}`}>{p.name}</Link> {!p.active && <span className="badge">inativo</span>}
                  </td>
                  <td>{p.category}</td>
                  <td className="num">{brl(p.price)}</td>
                  <td className="num">{p.variants}</td>
                  <td className="num">{p.stock}</td>
                  <td>{p.low_variants > 0 ? <span className="badge warn">{p.low_variants} baixa(s)</span> : <span className="badge ok">OK</span>}</td>
                </tr>
              ))}
              {data && !data.length && <tr><td colSpan={6} className="muted">Nenhum produto cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, brl, dataHora } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, StockBadge, useApi } from "../components/ui";

interface Variante {
  id: number;
  size: string;
  color: string;
  sku: string;
  quantity: number;
  min_quantity: number;
  sold30: number;
}

interface Movimento {
  id: number;
  type: "entrada" | "venda" | "ajuste";
  quantity: number;
  note: string;
  created_at: string;
  size: string;
  color: string;
  user_name: string | null;
}

interface Produto {
  id: number;
  name: string;
  category: string;
  description: string;
  price: number;
  cost: number;
  variants: Variante[];
  movements: Movimento[];
}

const TIPO = { entrada: "badge ok", venda: "badge info", ajuste: "badge warn" };

export function ProductDetailPage() {
  const { id } = useParams();
  const { session } = useAuth();
  const dono = session?.user.role === "dono";
  const { data, error, reload } = useApi<Produto>(`/products/${id}`);
  const [mov, setMov] = useState<{ variantId: number; type: "entrada" | "ajuste"; quantity: string; note: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvarMovimento() {
    if (!mov) return;
    setErro(null);
    try {
      await api("/stock/movements", { body: { ...mov, quantity: Number(mov.quantity) } });
      setMov(null);
      reload();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function mudarMinimo(v: Variante, valor: string) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 0 || n === v.min_quantity) return;
    try {
      await api(`/products/variants/${v.id}`, { method: "PATCH", body: { minQuantity: n } });
      reload();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (error) return <ErrorBox error={error} />;
  if (!data) return <p>Carregando…</p>;
  const total = data.variants.reduce((s, v) => s + v.quantity, 0);
  const margem = data.price > 0 ? ((data.price - data.cost) / data.price) * 100 : 0;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{data.name}</h1>
          <p className="muted">
            {data.category} · {brl(data.price)} · margem {margem.toFixed(0)}% · {total} peças em estoque
          </p>
        </div>
        <Link to="/produtos">← Produtos</Link>
      </div>
      <ErrorBox error={erro} />

      <div className="card">
        <h2>Grade de estoque</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Tamanho</th><th>Cor</th><th>SKU</th><th className="num">Vendidas 30d</th><th className="num">Estoque</th><th className="num">Mínimo</th><th>Situação</th>{dono && <th></th>}</tr>
            </thead>
            <tbody>
              {data.variants.map((v) => (
                <tr key={v.id}>
                  <td>{v.size}</td>
                  <td>{v.color}</td>
                  <td className="small muted">{v.sku}</td>
                  <td className="num">{v.sold30}</td>
                  <td className="num"><strong>{v.quantity}</strong></td>
                  <td className="num">
                    {dono ? (
                      <input key={`${v.id}-${v.min_quantity}`} className="qty" type="number" min={0} defaultValue={v.min_quantity} onBlur={(e) => mudarMinimo(v, e.target.value)} aria-label="Estoque mínimo" />
                    ) : (
                      v.min_quantity
                    )}
                  </td>
                  <td><StockBadge quantity={v.quantity} min={v.min_quantity} /></td>
                  {dono && (
                    <td className="nowrap right">
                      <button className="ghost sm" onClick={() => setMov({ variantId: v.id, type: "entrada", quantity: "", note: "" })}>Entrada</button>{" "}
                      <button className="light sm" onClick={() => setMov({ variantId: v.id, type: "ajuste", quantity: "", note: "" })}>Ajuste</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {mov && (
          <div className="card" style={{ marginTop: 14, background: "var(--bg)" }}>
            {(() => {
              const v = data.variants.find((x) => x.id === mov.variantId)!;
              return (
                <h3>
                  {mov.type === "entrada" ? "Entrada de mercadoria" : "Ajuste de inventário"}: {v.size} · {v.color} (atual: {v.quantity})
                </h3>
              );
            })()}
            <div className="row" style={{ alignItems: "flex-end" }}>
              <div style={{ width: 140 }}>
                <label htmlFor="mq">{mov.type === "entrada" ? "Quantidade recebida" : "Diferença (+/-)"}</label>
                <input id="mq" type="number" value={mov.quantity} onChange={(e) => setMov({ ...mov, quantity: e.target.value })} autoFocus />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label htmlFor="mn">Observação</label>
                <input id="mn" value={mov.note} onChange={(e) => setMov({ ...mov, note: e.target.value })} placeholder={mov.type === "entrada" ? "Fornecedor, nota…" : "Motivo do ajuste"} />
              </div>
              <button onClick={salvarMovimento} disabled={!mov.quantity}>Salvar</button>
              <button className="light" onClick={() => setMov(null)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Histórico de movimentações</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Quando</th><th>Tipo</th><th>Variante</th><th className="num">Qtd.</th><th>Observação</th><th>Por</th></tr></thead>
            <tbody>
              {data.movements.map((m) => (
                <tr key={m.id}>
                  <td className="nowrap">{dataHora(m.created_at)}</td>
                  <td><span className={TIPO[m.type]}>{m.type}</span></td>
                  <td>{m.size} · {m.color}</td>
                  <td className="num">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                  <td>{m.note}</td>
                  <td>{m.user_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

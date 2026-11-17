import { useEffect, useState } from "react";
import { api, brl, dataHora } from "../api";
import { ErrorBox, useApi } from "../components/ui";

interface VarianteBusca {
  id: number;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  product_name: string;
  price: number;
}

interface Item extends VarianteBusca {
  qtd: number;
}

interface Venda {
  id: number;
  total: number;
  payment_method: string;
  created_at: string;
  user_name: string;
  items: number;
}

const PAGAMENTOS = { pix: "Pix", debito: "Débito", credito: "Crédito", dinheiro: "Dinheiro" } as const;

export function SellPage() {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<VarianteBusca[]>([]);
  const [carrinho, setCarrinho] = useState<Item[]>([]);
  const [pagamento, setPagamento] = useState<keyof typeof PAGAMENTOS>("pix");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const vendas = useApi<Venda[]>("/sales");

  // Busca com pequeno atraso para não chamar a API a cada tecla.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        setResultados(await api<VarianteBusca[]>(`/products/variants/search?q=${encodeURIComponent(busca)}`));
      } catch (e) {
        setErro((e as Error).message);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [busca]);

  function adicionar(v: VarianteBusca) {
    setOk(null);
    setCarrinho((c) => {
      const existe = c.find((i) => i.id === v.id);
      if (existe) return c.map((i) => (i.id === v.id ? { ...i, qtd: Math.min(i.qtd + 1, v.quantity) } : i));
      return [...c, { ...v, qtd: 1 }];
    });
  }

  const total = carrinho.reduce((s, i) => s + i.price * i.qtd, 0);

  async function finalizar() {
    setEnviando(true);
    setErro(null);
    try {
      const r = await api<{ id: number; total: number }>("/sales", {
        body: { paymentMethod: pagamento, items: carrinho.map((i) => ({ variantId: i.id, quantity: i.qtd })) },
      });
      setOk(`Venda #${r.id} registrada: ${brl(r.total)}. O estoque já foi atualizado.`);
      setCarrinho([]);
      vendas.reload();
      setResultados(await api<VarianteBusca[]>(`/products/variants/search?q=${encodeURIComponent(busca)}`));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Vender</h1>
          <p className="muted">Busque a peça pelo nome, cor, tamanho ou código e adicione ao carrinho.</p>
        </div>
      </div>
      <ErrorBox error={erro} />
      {ok && <div className="alert ok">{ok}</div>}

      <div className="pdv">
        <div className="card">
          <input placeholder="Ex.: camiseta preta M" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus aria-label="Buscar peça" />
          <div style={{ marginTop: 10, maxHeight: 460, overflowY: "auto" }}>
            {resultados.map((v) => (
              <div className="result-item" key={v.id}>
                <div>
                  <div><strong>{v.product_name}</strong></div>
                  <div className="small muted">
                    {v.size} · {v.color} · {v.sku}
                  </div>
                </div>
                <div className="row nowrap">
                  <span className="small">{brl(v.price)}</span>
                  <span className={`badge ${v.quantity === 0 ? "danger" : v.quantity <= 2 ? "warn" : ""}`}>{v.quantity} em estoque</span>
                  <button className="sm" disabled={v.quantity === 0} onClick={() => adicionar(v)}>Adicionar</button>
                </div>
              </div>
            ))}
            {!resultados.length && <p className="muted small" style={{ padding: 8 }}>Nenhuma peça encontrada.</p>}
          </div>
        </div>

        <div className="card">
          <h2>Carrinho</h2>
          {!carrinho.length && <p className="muted">Nenhum item ainda.</p>}
          {carrinho.map((i) => (
            <div className="result-item" key={i.id}>
              <div>
                <div><strong>{i.product_name}</strong></div>
                <div className="small muted">{i.size} · {i.color} · {brl(i.price)}</div>
              </div>
              <div className="row nowrap">
                <input
                  className="qty"
                  type="number"
                  min={1}
                  max={i.quantity}
                  value={i.qtd}
                  aria-label="Quantidade"
                  onChange={(e) => setCarrinho((c) => c.map((x) => (x.id === i.id ? { ...x, qtd: Math.max(1, Number(e.target.value) || 1) } : x)))}
                />
                <button className="light sm" onClick={() => setCarrinho((c) => c.filter((x) => x.id !== i.id))} aria-label="Remover">✕</button>
              </div>
            </div>
          ))}
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="pag">Forma de pagamento</label>
            <select id="pag" value={pagamento} onChange={(e) => setPagamento(e.target.value as keyof typeof PAGAMENTOS)}>
              {Object.entries(PAGAMENTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <span className="total">{brl(total)}</span>
            <button disabled={!carrinho.length || enviando} onClick={finalizar}>{enviando ? "Registrando…" : "Finalizar venda"}</button>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Últimas vendas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Quando</th><th>Vendedor</th><th>Pagamento</th><th className="num">Peças</th><th className="num">Total</th></tr></thead>
            <tbody>
              {(vendas.data ?? []).slice(0, 10).map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td>
                  <td>{dataHora(v.created_at)}</td>
                  <td>{v.user_name}</td>
                  <td>{PAGAMENTOS[v.payment_method as keyof typeof PAGAMENTOS]}</td>
                  <td className="num">{v.items}</td>
                  <td className="num">{brl(v.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

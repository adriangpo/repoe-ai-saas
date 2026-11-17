import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { ErrorBox } from "../components/ui";

const separa = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function NewProductPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "",
    category: "",
    description: "",
    price: "",
    cost: "",
    sizes: "P, M, G, GG",
    colors: "Preto, Branco",
    initialQuantity: "5",
    minQuantity: "2",
  });
  const [erro, setErro] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const tamanhos = separa(f.sizes);
  const cores = separa(f.colors);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const r = await api<{ id: number }>("/products", {
        body: { ...f, sizes: tamanhos, colors: cores, price: f.price.replace(",", "."), cost: (f.cost || "0").replace(",", ".") },
      });
      navigate(`/produtos/${r.id}`);
    } catch (err) {
      setErro((err as Error).message);
      setUpgrade(err instanceof ApiError && err.codigo === "limite_plano");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Novo produto</h1>
          <p className="muted">Informe os tamanhos e as cores: o Repõe Aí! cria todas as combinações da grade.</p>
        </div>
        <Link to="/produtos">← Voltar</Link>
      </div>
      <ErrorBox error={erro} />
      {upgrade && <div className="alert info">Veja os planos em <Link to="/plano">Plano</Link>.</div>}
      <form className="grid k2" onSubmit={salvar}>
        <div className="card">
          <h2>Dados do produto</h2>
          <div className="field"><label htmlFor="n">Nome</label><input id="n" value={f.name} onChange={set("name")} required /></div>
          <div className="field"><label htmlFor="c">Categoria</label><input id="c" value={f.category} onChange={set("category")} placeholder="Camisetas, Vestidos…" required /></div>
          <div className="field"><label htmlFor="d">Descrição (opcional)</label><input id="d" value={f.description} onChange={set("description")} placeholder="Tecido, modelagem, coleção" /></div>
          <div className="grid k2" style={{ gap: 12 }}>
            <div className="field"><label htmlFor="p">Preço de venda (R$)</label><input id="p" inputMode="decimal" value={f.price} onChange={set("price")} required /></div>
            <div className="field"><label htmlFor="cu">Custo (R$)</label><input id="cu" inputMode="decimal" value={f.cost} onChange={set("cost")} /></div>
          </div>
        </div>
        <div className="card">
          <h2>Grade</h2>
          <div className="field"><label htmlFor="t">Tamanhos</label><input id="t" value={f.sizes} onChange={set("sizes")} /><div className="hint">Separe por vírgula.</div></div>
          <div className="field"><label htmlFor="co">Cores</label><input id="co" value={f.colors} onChange={set("colors")} /><div className="hint">Separe por vírgula.</div></div>
          <div className="grid k2" style={{ gap: 12 }}>
            <div className="field"><label htmlFor="qi">Estoque inicial por variante</label><input id="qi" type="number" min={0} value={f.initialQuantity} onChange={set("initialQuantity")} /></div>
            <div className="field"><label htmlFor="qm">Estoque mínimo</label><input id="qm" type="number" min={0} value={f.minQuantity} onChange={set("minQuantity")} /></div>
          </div>
          <p className="small muted">Serão criadas <strong>{tamanhos.length * cores.length}</strong> variantes:</p>
          <div className="chips" style={{ marginBottom: 14 }}>
            {cores.flatMap((c) => tamanhos.map((t) => <span className="badge" key={c + t}>{t} · {c}</span>))}
          </div>
          <button type="submit" disabled={enviando || !tamanhos.length || !cores.length}>{enviando ? "Salvando…" : "Salvar produto"}</button>
        </div>
      </form>
    </div>
  );
}

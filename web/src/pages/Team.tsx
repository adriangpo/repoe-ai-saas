import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, useApi } from "../components/ui";

interface Membro {
  id: number;
  name: string;
  email: string;
  role: "dono" | "vendedor";
}

export function TeamPage() {
  const { session } = useAuth();
  const dono = session?.user.role === "dono";
  const { data, error, reload } = useApi<Membro[]>("/account/team");
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [ok, setOk] = useState<string | null>(null);

  async function adicionar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setOk(null);
    setUpgrade(false);
    try {
      await api("/account/team", { body: f });
      setOk(`${f.name} já pode entrar com o e-mail ${f.email}.`);
      setF({ name: "", email: "", password: "" });
      reload();
    } catch (err) {
      setErro((err as Error).message);
      setUpgrade(err instanceof ApiError && err.codigo === "limite_plano");
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Equipe</h1>
          <p className="muted">Vendedores podem registrar vendas e consultar o estoque. Cadastro de produtos, entradas e plano ficam com o dono.</p>
        </div>
      </div>
      <ErrorBox error={error ?? erro} />
      {upgrade && <div className="alert info">Para adicionar vendedores, mude para o plano Profissional em <Link to="/plano">Plano</Link>.</div>}
      {ok && <div className="alert ok">{ok}</div>}
      <div className="grid k2">
        <div className="card">
          <h2>Usuários da loja</h2>
          <table>
            <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th></tr></thead>
            <tbody>
              {(data ?? []).map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className="small">{m.email}</td>
                  <td><span className={`badge ${m.role === "dono" ? "brand" : ""}`}>{m.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {dono && (
          <form className="card" onSubmit={adicionar}>
            <h2>Adicionar vendedor</h2>
            <div className="field"><label htmlFor="tn">Nome</label><input id="tn" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
            <div className="field"><label htmlFor="te">E-mail</label><input id="te" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
            <div className="field"><label htmlFor="tp">Senha inicial</label><input id="tp" type="password" minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required autoComplete="new-password" /></div>
            <button type="submit">Adicionar</button>
          </form>
        )}
      </div>
    </div>
  );
}

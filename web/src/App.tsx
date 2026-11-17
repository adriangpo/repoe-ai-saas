import { Navigate, NavLink, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Logo } from "./components/ui";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { SellPage } from "./pages/Sell";
import { ProductsPage } from "./pages/Products";
import { NewProductPage } from "./pages/NewProduct";
import { ProductDetailPage } from "./pages/ProductDetail";
import { RestockPage } from "./pages/Restock";
import { TeamPage } from "./pages/Team";
import { PlanPage } from "./pages/Plan";

export function App() {
  const { session, loading, logout } = useAuth();
  if (loading) return <p style={{ padding: 32 }}>Carregando…</p>;
  if (!session) return <LoginPage />;

  const dono = session.user.role === "dono";
  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="logo">
          <Logo />
        </div>
        <NavLink to="/" end>Painel</NavLink>
        <NavLink to="/vender">Vender</NavLink>
        <NavLink to="/produtos">Produtos e estoque</NavLink>
        <NavLink to="/reposicao">Reposição</NavLink>
        <NavLink to="/equipe">Equipe</NavLink>
        <NavLink to="/plano">Plano</NavLink>
        <div className="grow" />
        <div className="who">
          <div style={{ color: "#fff", fontWeight: 600 }}>{session.store.name}</div>
          <div>
            {session.user.name} · {dono ? "dono" : "vendedor"}
          </div>
          <div style={{ marginTop: 4 }}>
            <span className="badge brand">Plano {session.plan.name}</span>
          </div>
          <button className="ghost sm" onClick={logout}>Sair</button>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/vender" element={<SellPage />} />
          <Route path="/produtos" element={<ProductsPage />} />
          <Route path="/produtos/novo" element={dono ? <NewProductPage /> : <Navigate to="/produtos" />} />
          <Route path="/produtos/:id" element={<ProductDetailPage />} />
          <Route path="/reposicao" element={<RestockPage />} />
          <Route path="/equipe" element={<TeamPage />} />
          <Route path="/plano" element={<PlanPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

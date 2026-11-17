import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { ErrorBox, Logo } from "../components/ui";

export function LoginPage() {
  const { login, signup } = useAuth();
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [form, setForm] = useState({ storeName: "", name: "", email: "", password: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      if (modo === "entrar") await login(form.email, form.password);
      else await signup(form);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="auth">
      <section className="pitch">
        <div className="row" style={{ marginBottom: 24 }}>
          <Logo size={40} />
          <strong style={{ fontSize: "1.5rem", color: "#fff" }}>Arara</strong>
        </div>
        <h1>Saiba o que tem na arara antes do cliente perguntar.</h1>
        <p style={{ fontSize: "1.05rem", maxWidth: 520 }}>
          Estoque por tamanho e cor, venda no balcão com baixa automática e um assistente que diz o que repor e o que colocar em promoção.
        </p>
        <ul>
          <li>Grade de tamanhos e cores gerada em um clique</li>
          <li>Alerta de peças esgotadas e com estoque baixo</li>
          <li>Reposição sugerida com IA (JEV) e regras de segurança</li>
          <li>Planos mensais a partir de R$ 49,90</li>
        </ul>
      </section>
      <section className="form">
        <form className="card" onSubmit={enviar}>
          <h2>{modo === "entrar" ? "Entrar na sua loja" : "Criar conta da loja"}</h2>
          <ErrorBox error={erro} />
          {modo === "cadastrar" && (
            <>
              <div className="field">
                <label htmlFor="storeName">Nome da loja</label>
                <input id="storeName" value={form.storeName} onChange={set("storeName")} required />
              </div>
              <div className="field">
                <label htmlFor="name">Seu nome</label>
                <input id="name" value={form.name} onChange={set("name")} required />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" value={form.email} onChange={set("email")} required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input id="password" type="password" value={form.password} onChange={set("password")} required minLength={6} autoComplete={modo === "entrar" ? "current-password" : "new-password"} />
          </div>
          <button type="submit" disabled={enviando} style={{ width: "100%", justifyContent: "center" }}>
            {enviando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta grátis"}
          </button>
          <p className="small muted" style={{ marginTop: 14, textAlign: "center" }}>
            {modo === "entrar" ? "Ainda não usa o Arara? " : "Já tem conta? "}
            <a href="#" onClick={(e) => { e.preventDefault(); setErro(null); setModo(modo === "entrar" ? "cadastrar" : "entrar"); }}>
              {modo === "entrar" ? "Cadastre sua loja" : "Entrar"}
            </a>
          </p>
        </form>
      </section>
    </div>
  );
}

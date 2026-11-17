import { useState } from "react";
import { Link } from "react-router-dom";
import { api, dataHora } from "../api";
import { useAuth } from "../auth";
import { ErrorBox, UrgencyBadge, useApi } from "../components/ui";

interface ItemAnalise {
  variante: {
    id: number;
    productId: number;
    produto: string;
    tamanho: string;
    cor: string;
    estoque: number;
    minimo: number;
    vendidas30: number;
    vendidasAnt30: number;
    diasSemVenda: number | null;
  };
  recomendacao: {
    acao: string;
    acaoNome: string;
    urgencia: number;
    quantidadeSugerida: number;
    motivo: string;
    fonte: "jev" | "regras";
    confianca: number | null;
    revisar: boolean;
  };
  regra: { acao: string; acaoNome: string; urgencia: number };
  falhaJev: string | null;
  jev: { enviado: unknown; recebido: unknown } | null;
}

interface Analise {
  fonte: "jev" | "regras" | "misto";
  motivoFallback: string | null;
  plano: string;
  analisadas: number;
  itens: ItemAnalise[];
  criadoEm: string;
}

interface Historico {
  id: number;
  source: string;
  note: string;
  created_at: string;
  user_name: string;
  itens: number;
}

const ACAO_CLASSE: Record<string, string> = { repor_agora: "danger", repor_pouco: "warn", aguardar: "", promocao: "info" };
const FONTE = { jev: "IA (JEV)", regras: "Regras locais", misto: "JEV + regras" };

export function RestockPage() {
  const { session } = useAuth();
  const [observacao, setObservacao] = useState("");
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const historico = useApi<Historico[]>("/reposicao/historico");

  async function analisar(modo: "auto" | "regras") {
    setRodando(true);
    setErro(null);
    try {
      setAnalise(await api<Analise>("/reposicao/analisar", { body: { observacao, modo } }));
      historico.reload();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setRodando(false);
    }
  }

  const temJev = session?.plan.jevAssistant;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Assistente de reposição</h1>
          <p className="muted">Analisa as vendas dos últimos 60 dias e indica o que repor, o que esperar e o que colocar em promoção.</p>
        </div>
      </div>
      <ErrorBox error={erro} />
      {!temJev && (
        <div className="alert info">
          No plano {session?.plan.name} a análise usa regras fixas. O plano Profissional inclui a análise com IA (JEV).{" "}
          <Link to="/plano">Ver planos</Link>
        </div>
      )}

      <div className="card">
        <div className="field">
          <label htmlFor="obs">Observação para a análise (opcional)</label>
          <input
            id="obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            maxLength={300}
            placeholder="Ex.: vamos fazer liquidação da coleção de inverno em dezembro"
          />
          <div className="hint">O JEV considera esse contexto junto com os números de cada peça.</div>
        </div>
        <div className="row">
          <button onClick={() => analisar("auto")} disabled={rodando}>
            {rodando ? "Analisando…" : temJev ? "Analisar com IA" : "Analisar"}
          </button>
          {temJev && (
            <button className="ghost" onClick={() => analisar("regras")} disabled={rodando}>
              Analisar só com regras
            </button>
          )}
        </div>
      </div>

      {analise && (
        <div className="card">
          <div className="page-head" style={{ marginBottom: 10 }}>
            <div>
              <h2 style={{ margin: 0 }}>Resultado</h2>
              <p className="small muted">
                {analise.analisadas} variantes analisadas · {analise.itens.length} precisam de atenção · {dataHora(analise.criadoEm)}
              </p>
            </div>
            <span className={`badge ${analise.fonte === "regras" ? "" : "brand"}`}>Fonte: {FONTE[analise.fonte]}</span>
          </div>
          {analise.motivoFallback && (
            <div className="alert warn">
              Análise feita com as regras locais: {analise.motivoFallback}. O resultado continua válido; só não considera contexto em texto.
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Peça</th>
                  <th className="num">Estoque</th>
                  <th className="num">Vendas 30d</th>
                  <th>Recomendação</th>
                  <th>Urgência</th>
                  <th className="num">Comprar</th>
                  <th>Por quê</th>
                </tr>
              </thead>
              <tbody>
                {analise.itens.map((i) => (
                  <tr key={i.variante.id}>
                    <td>
                      <Link to={`/produtos/${i.variante.productId}`}>{i.variante.produto}</Link>
                      <div className="small muted">{i.variante.tamanho} · {i.variante.cor}</div>
                    </td>
                    <td className="num">{i.variante.estoque}<span className="small muted"> / mín. {i.variante.minimo}</span></td>
                    <td className="num">
                      {i.variante.vendidas30}
                      <div className="small muted">antes: {i.variante.vendidasAnt30}</div>
                    </td>
                    <td>
                      <span className={`badge ${ACAO_CLASSE[i.recomendacao.acao]}`}>{i.recomendacao.acaoNome}</span>
                      <div className="small muted" style={{ marginTop: 3 }}>
                        {i.recomendacao.fonte === "jev"
                          ? `JEV${i.recomendacao.confianca !== null ? ` · ${Math.round(i.recomendacao.confianca * 100)}%` : ""}`
                          : "regras"}
                        {i.recomendacao.revisar && <span className="badge warn" style={{ marginLeft: 4 }}>revisar</span>}
                      </div>
                    </td>
                    <td><UrgencyBadge value={i.recomendacao.urgencia} /></td>
                    <td className="num"><strong>{i.recomendacao.quantidadeSugerida || "—"}</strong></td>
                    <td className="small" style={{ maxWidth: 300 }}>
                      {i.recomendacao.motivo}
                      {i.falhaJev && <div className="muted">JEV indisponível: {i.falhaJev}</div>}
                      {i.jev && (
                        <details>
                          <summary>ver consulta ao JEV</summary>
                          <pre>{JSON.stringify(i.jev, null, 2)}</pre>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
                {!analise.itens.length && <tr><td colSpan={7} className="muted">Nenhuma peça precisa de atenção agora.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Análises anteriores</h2>
        <table>
          <thead><tr><th>Quando</th><th>Por</th><th>Fonte</th><th className="num">Itens</th><th>Observação</th></tr></thead>
          <tbody>
            {(historico.data ?? []).map((h) => (
              <tr key={h.id}>
                <td>{dataHora(h.created_at)}</td>
                <td>{h.user_name}</td>
                <td>{FONTE[h.source as keyof typeof FONTE]}</td>
                <td className="num">{h.itens}</td>
                <td className="small">{h.note || "—"}</td>
              </tr>
            ))}
            {historico.data && !historico.data.length && <tr><td colSpan={5} className="muted">Nenhuma análise ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

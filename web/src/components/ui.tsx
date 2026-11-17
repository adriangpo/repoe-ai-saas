import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

export function Logo({ size = 26 }: { size?: number }) {
  // Cabide estilizado (arara de roupas).
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 6a3 3 0 1 1 3 3c-1.2 0-3 .8-3 2.5v1.2L4.5 21.5c-1 .8-.5 2.5.8 2.5h21.4c1.3 0 1.8-1.7.8-2.5L16 12.7" fill="none" stroke="#5eead4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="alert error">{error}</div>;
}

/** Busca dados da API ao montar o componente, com recarga manual. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

export function StockBadge({ quantity, min }: { quantity: number; min: number }) {
  if (quantity === 0) return <span className="badge danger">Esgotado</span>;
  if (quantity <= min) return <span className="badge warn">Baixo</span>;
  return <span className="badge ok">OK</span>;
}

const URG = ["Baixa", "Moderada", "Alta", "Crítica"];
const URG_CLASSE = ["", "info", "warn", "danger"];
export function UrgencyBadge({ value }: { value: number }) {
  return <span className={`badge ${URG_CLASSE[value] ?? ""}`}>{URG[value] ?? value}</span>;
}

import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

/** Símbolo do Repõe Aí!: seta de reposição girando em volta de uma camiseta. */
export function BrandMark({ size = 32, tone = "dark" }: { size?: number; tone?: "dark" | "light" }) {
  const bg = tone === "dark" ? "#5eead4" : "#0f766e";
  const fg = tone === "dark" ? "#12312d" : "#ffffff";
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="8" fill={bg} />
      <path d="M23.3 9.9A9.5 9.5 0 1 1 14.4 6.6" fill="none" stroke={fg} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M13.6 3.6 18.4 6.3 14.6 10.2Z" fill={fg} stroke={fg} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M13 12 10.5 13.4 11.4 15.5 12.8 15V20H19.2V15L20.6 15.5 21.5 13.4 19 12C18.6 12.9 17.4 13.5 16 13.5S13.4 12.9 13 12Z" fill={fg} />
    </svg>
  );
}

/** Logo completa: símbolo + "Repõe Aí!" inclinado, com o "Aí!" em adesivo. */
export function Logo({ size = 20, tone = "dark" }: { size?: number; tone?: "dark" | "light" }) {
  return (
    <span className={`brand ${tone}`} style={{ fontSize: size }} role="img" aria-label="Repõe Aí!">
      <BrandMark size={size * 1.7} tone={tone} />
      <span className="brand-word" aria-hidden="true">
        <span className="rep">Repõe</span>
        <span className="ai">Aí!</span>
      </span>
    </span>
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

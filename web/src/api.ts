// Cliente HTTP da interface: toda comunicação com a API passa por aqui.

const TOKEN_KEY = "arara.token";

export class ApiError extends Error {
  constructor(public status: number, message: string, public codigo?: string) {
    super(message);
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* navegador sem armazenamento: o login dura só esta aba */
    }
  },
};

let aoExpirar: () => void = () => {};
export function onUnauthorized(fn: () => void) {
  aoExpirar = fn;
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  const resp = await fetch(`/api${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 401 && token) aoExpirar();
    throw new ApiError(resp.status, data.erro ?? `Erro ${resp.status}`, data.codigo);
  }
  return data as T;
}

const brlFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const brl = (n: number) => brlFmt.format(n);
export const dataHora = (s: string) =>
  new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

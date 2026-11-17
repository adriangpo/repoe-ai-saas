import { config } from "../config.js";
import type { JevAnswers } from "./restock.js";

/** Erro que indica que o JEV não pôde ser usado e o sistema deve cair nas regras. */
export class JevUnavailable extends Error {}

export function jevConfigured(): boolean {
  return config.jevKey.length > 0;
}

/** Envia uma consulta ao JEV (systemone) e devolve o objeto `answers`. */
export async function askJev(payload: unknown, keys: string[]): Promise<JevAnswers> {
  if (!jevConfigured()) throw new JevUnavailable("chave do JEV não configurada");

  let resp: Response;
  try {
    resp = await fetch(config.jevUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.jevKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.jevTimeoutMs),
    });
  } catch (e) {
    const nome = (e as Error).name;
    throw new JevUnavailable(nome === "TimeoutError" ? "JEV não respondeu a tempo" : "sem conexão com o JEV");
  }
  if (!resp.ok) throw new JevUnavailable(`JEV retornou HTTP ${resp.status}`);

  const body = (await resp.json().catch(() => null)) as { answers?: Record<string, unknown> } | null;
  const answers = body?.answers;
  if (!answers || keys.some((k) => !(k in answers))) throw new JevUnavailable("JEV retornou respostas incompletas");
  return answers as JevAnswers;
}

import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

/** Erro "esperado" com status HTTP e mensagem para mostrar ao usuário. */
export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ erro: err.message, ...err.extra });
    return;
  }
  if (err instanceof ZodError) {
    const primeiro = err.issues[0];
    const campo = primeiro?.path.join(".");
    res.status(400).json({ erro: campo ? `${campo}: ${primeiro.message}` : primeiro?.message ?? "Dados inválidos." });
    return;
  }
  // Violação de UNIQUE no Postgres
  if (err?.code === "23505") {
    res.status(409).json({ erro: "Já existe um registro com esses dados." });
    return;
  }
  console.error(err);
  res.status(500).json({ erro: "Erro interno no servidor." });
};

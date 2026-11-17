import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { HttpError } from "./errors.js";

export type Role = "dono" | "vendedor";

export interface AuthUser {
  userId: number;
  storeId: number;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const hashPassword = (senha: string) => bcrypt.hash(senha, 10);
export const checkPassword = (senha: string, hash: string) => bcrypt.compare(senha, hash);

export function signToken(user: AuthUser): string {
  return jwt.sign(user, config.jwtSecret, { expiresIn: "12h" });
}

/** Exige um token válido e coloca { userId, storeId, role } em req.user. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Faça login para continuar.");
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthUser;
    req.user = { userId: payload.userId, storeId: payload.storeId, role: payload.role };
    next();
  } catch {
    throw new HttpError(401, "Sessão expirada. Entre novamente.");
  }
}

export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (req.user?.role !== role) throw new HttpError(403, "Apenas o dono da loja pode fazer isso.");
    next();
  };
}

/** Atalho para obter o usuário autenticado já com tipo garantido. */
export function me(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, "Faça login para continuar.");
  return req.user;
}

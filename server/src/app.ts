import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config } from "./config.js";
import { requireAuth } from "./auth.js";
import { errorHandler } from "./errors.js";
import { authRouter } from "./routes/auth.js";
import { productsRouter } from "./routes/products.js";
import { stockRouter } from "./routes/stock.js";
import { salesRouter } from "./routes/sales.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { restockRouter } from "./routes/restock.js";
import { accountRouter } from "./routes/account.js";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/auth", authRouter);

  // Daqui para baixo, todas as rotas exigem login.
  app.use("/api", requireAuth);
  app.use("/api/products", productsRouter);
  app.use("/api/stock", stockRouter);
  app.use("/api/sales", salesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/reposicao", restockRouter);
  app.use("/api/account", accountRouter);

  app.use("/api", (_req, res) => {
    res.status(404).json({ erro: "Rota não encontrada." });
  });

  // Em produção (npm run build && npm start) a própria API entrega a interface React.
  const web = path.join(config.raiz, "web", "dist");
  if (fs.existsSync(web)) {
    app.use(express.static(web));
    app.get("/{*rota}", (_req, res) => {
      res.sendFile(path.join(web, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}

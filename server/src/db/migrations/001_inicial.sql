-- Arara: estrutura inicial.
-- Cada loja (cliente do SaaS) é um "tenant": todas as tabelas de dados
-- carregam store_id e toda consulta da API filtra por ele.

CREATE TABLE stores (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'basico' CHECK (plan IN ('basico', 'profissional')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL CHECK (role IN ('dono', 'vendedor')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price        NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  cost         NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_store_idx ON products (store_id);

-- Variante = uma combinação de tamanho e cor de um produto (a "grade").
CREATE TABLE variants (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size          TEXT NOT NULL,
  color         TEXT NOT NULL,
  sku           TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity  INTEGER NOT NULL DEFAULT 2 CHECK (min_quantity >= 0),
  UNIQUE (product_id, size, color),
  UNIQUE (store_id, sku)
);
CREATE INDEX variants_store_idx ON variants (store_id);

CREATE TABLE sales (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  total           NUMERIC(10, 2) NOT NULL,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('dinheiro', 'pix', 'debito', 'credito')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sales_store_date_idx ON sales (store_id, created_at);

CREATE TABLE sale_items (
  id          SERIAL PRIMARY KEY,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id  INTEGER NOT NULL REFERENCES variants(id),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(10, 2) NOT NULL
);
CREATE INDEX sale_items_variant_idx ON sale_items (variant_id);

-- Toda alteração de estoque gera um registro (entrada, venda ou ajuste).
CREATE TABLE stock_movements (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  variant_id  INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('entrada', 'venda', 'ajuste')),
  quantity    INTEGER NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  sale_id     INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_variant_idx ON stock_movements (variant_id, created_at);

-- Histórico das análises do assistente de reposição.
CREATE TABLE restock_analyses (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source       TEXT NOT NULL CHECK (source IN ('jev', 'regras', 'misto')),
  note         TEXT NOT NULL DEFAULT '',
  result       JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

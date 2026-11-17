// Cria uma loja de demonstração com produtos e 60 dias de vendas simuladas.
// Pode ser executado de novo: apaga e recria apenas a loja de demonstração.
import { pool, transaction, query } from "../db.js";
import { hashPassword } from "../auth.js";

const DEMO_EMAIL = "dona@arara.demo";
const DEMO_SENHA = "demo1234"; // dado fictício, apenas para a demonstração local

// Gerador pseudoaleatório com semente fixa: os dados saem iguais em toda execução.
let semente = 20261123;
function rand() {
  semente = (semente * 1664525 + 1013904223) % 4294967296;
  return semente / 4294967296;
}
const inteiro = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

interface ProdutoDemo {
  name: string;
  category: string;
  description: string;
  price: number;
  cost: number;
  sizes: string[];
  colors: string[];
  inicial: number; // estoque inicial de cada variante
  min: number;
  peso: number; // procura relativa nos últimos 45 dias
  pesoAntigo?: number; // procura entre 60 e 45 dias atrás (peças de inverno)
  reposicao?: number; // entrada extra há 25 dias (por variante)
}

const PRODUTOS: ProdutoDemo[] = [
  { name: "Camiseta básica de algodão", category: "Camisetas", description: "Gola redonda, 100% algodão", price: 49.9, cost: 18, sizes: ["P", "M", "G", "GG"], colors: ["Preto", "Branco", "Azul-marinho"], inicial: 10, min: 3, peso: 9, reposicao: 6 },
  { name: "Regata canelada", category: "Blusas", description: "Tecido canelado leve, ideal para o calor", price: 39.9, cost: 14, sizes: ["P", "M", "G"], colors: ["Branco", "Verde-oliva"], inicial: 9, min: 2, peso: 7 },
  { name: "Vestido midi floral", category: "Vestidos", description: "Viscose estampada, alças finas", price: 139.9, cost: 55, sizes: ["P", "M", "G"], colors: ["Floral azul"], inicial: 9, min: 2, peso: 7 },
  { name: "Short jeans", category: "Shorts", description: "Cintura alta, barra desfiada", price: 89.9, cost: 35, sizes: ["36", "38", "40", "42"], colors: ["Azul-claro"], inicial: 9, min: 2, peso: 5 },
  { name: "Bermuda de sarja", category: "Bermudas", description: "Masculina, com elastano", price: 99.9, cost: 40, sizes: ["38", "40", "42", "44"], colors: ["Bege", "Preto"], inicial: 7, min: 2, peso: 3 },
  { name: "Calça jeans reta", category: "Calças", description: "Lavagem escura, modelagem reta", price: 159.9, cost: 65, sizes: ["36", "38", "40", "42", "44"], colors: ["Azul-escuro"], inicial: 7, min: 2, peso: 2.5 },
  { name: "Camisa de linho", category: "Camisas", description: "Manga longa, linho misto", price: 129.9, cost: 50, sizes: ["P", "M", "G"], colors: ["Branco", "Areia"], inicial: 7, min: 2, peso: 2.5 },
  { name: "Saia plissada", category: "Saias", description: "Midi, cós com elástico", price: 79.9, cost: 30, sizes: ["P", "M", "G"], colors: ["Preto", "Rosa"], inicial: 5, min: 1, peso: 1 },
  { name: "Boné aba curva", category: "Acessórios", description: "Ajustável, sarja", price: 59.9, cost: 20, sizes: ["Único"], colors: ["Preto", "Branco"], inicial: 10, min: 3, peso: 2 },
  // Peças de inverno: venderam no começo do período e depois pararam.
  { name: "Jaqueta de couro sintético", category: "Casacos", description: "Forrada, coleção de inverno", price: 219.9, cost: 90, sizes: ["P", "M", "G"], colors: ["Preto"], inicial: 7, min: 1, peso: 0, pesoAntigo: 2 },
  { name: "Moletom com capuz", category: "Casacos", description: "Flanelado por dentro, coleção de inverno", price: 149.9, cost: 60, sizes: ["P", "M", "G", "GG"], colors: ["Cinza-mescla", "Preto"], inicial: 6, min: 2, peso: 0.15, pesoAntigo: 3 },
  { name: "Cachecol de tricô", category: "Acessórios", description: "Tricô grosso, coleção de inverno", price: 49.9, cost: 15, sizes: ["Único"], colors: ["Vinho", "Cinza"], inicial: 9, min: 1, peso: 0, pesoAntigo: 1.5 },
];

const PAGAMENTOS = ["pix", "pix", "debito", "credito", "credito", "dinheiro"];

function diasAtras(d: number, hora = 10): Date {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(hora, inteiro(0, 59), inteiro(0, 59), 0);
  return t;
}

async function main() {
  const hash = await hashPassword(DEMO_SENHA);

  await transaction(async (c) => {
    // Remove a demonstração anterior, se existir.
    const antiga = "SELECT store_id FROM users WHERE email = $1";
    await c.query(`DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE store_id IN (${antiga}))`, [DEMO_EMAIL]);
    await c.query(`DELETE FROM stores WHERE id IN (${antiga})`, [DEMO_EMAIL]);

    const [store] = await query("INSERT INTO stores (name, plan, created_at) VALUES ($1, 'profissional', $2) RETURNING id", [
      "Vila Moda (demonstração)",
      diasAtras(90),
    ], c);
    const [dona] = await query(
      "INSERT INTO users (store_id, name, email, password_hash, role) VALUES ($1,'Carla (dona)',$2,$3,'dono') RETURNING id",
      [store.id, DEMO_EMAIL, hash],
      c,
    );
    const [vend] = await query(
      "INSERT INTO users (store_id, name, email, password_hash, role) VALUES ($1,'Bruno (vendedor)','vendedor@arara.demo',$2,'vendedor') RETURNING id",
      [store.id, hash],
      c,
    );

    type Var = { id: number; qtd: number; price: number; size: string; prod: ProdutoDemo };
    const variantes: Var[] = [];
    for (const [i, p] of PRODUTOS.entries()) {
      const [prod] = await query(
        "INSERT INTO products (store_id, name, category, description, price, cost, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [store.id, p.name, p.category, p.description, p.price, p.cost, diasAtras(90)],
        c,
      );
      for (const color of p.colors) {
        for (const size of p.sizes) {
          const sku = `${p.name.slice(0, 4).toUpperCase()}${i + 1}-${size.slice(0, 3).toUpperCase()}-${color.slice(0, 3).toUpperCase()}`
            .normalize("NFD")
            .replace(/[^A-Z0-9-]/g, "");
          const [v] = await query(
            "INSERT INTO variants (store_id, product_id, size, color, sku, quantity, min_quantity) VALUES ($1,$2,$3,$4,$5,0,$6) RETURNING id",
            [store.id, prod.id, size, color, sku, p.min],
            c,
          );
          // Tamanhos do meio (M, 38, 40) começam com um pouco mais de estoque.
          const extra = ["M", "38", "40"].includes(size) ? 2 : 0;
          const qtd = p.inicial + extra;
          await query(
            "INSERT INTO stock_movements (store_id, variant_id, type, quantity, note, user_id, created_at) VALUES ($1,$2,'entrada',$3,'Estoque inicial',$4,$5)",
            [store.id, v.id, qtd, dona.id, diasAtras(62, 9)],
            c,
          );
          variantes.push({ id: v.id, qtd, price: p.price, size, prod: p });
        }
      }
    }

    // Simula 60 dias de vendas, do mais antigo para o mais recente.
    let vendas = 0;
    for (let d = 60; d >= 0; d--) {
      if (d === 25) {
        // Reposição feita pela dona no meio do período.
        for (const v of variantes.filter((x) => x.prod.reposicao)) {
          v.qtd += v.prod.reposicao!;
          await query(
            "INSERT INTO stock_movements (store_id, variant_id, type, quantity, note, user_id, created_at) VALUES ($1,$2,'entrada',$3,'Reposição do fornecedor',$4,$5)",
            [store.id, v.id, v.prod.reposicao, dona.id, diasAtras(25, 9)],
            c,
          );
        }
      }
      const antigo = d > 45;
      const fimDeSemana = [0, 6].includes(diasAtras(d).getDay());
      const qtdVendas = inteiro(2, fimDeSemana ? 6 : 4);
      for (let k = 0; k < qtdVendas; k++) {
        const pesos = variantes.map((v) => {
          const ref = antigo ? (v.prod.pesoAntigo ?? v.prod.peso) : v.prod.peso;
          const centro = ["M", "38", "40"].includes(v.size) ? 1.6 : 1;
          return v.qtd > 0 ? ref * centro : 0;
        });
        const soma = pesos.reduce((a, b) => a + b, 0);
        if (soma === 0) break;
        const nItens = rand() < 0.7 ? 1 : 2;
        const carrinho = new Map<Var, number>();
        for (let n = 0; n < nItens; n++) {
          let r = rand() * soma;
          const idx = pesos.findIndex((p) => (r -= p) <= 0);
          const v = variantes[idx === -1 ? pesos.length - 1 : idx];
          if (v.qtd - (carrinho.get(v) ?? 0) > 0) carrinho.set(v, (carrinho.get(v) ?? 0) + 1);
        }
        if (!carrinho.size) continue;
        const quando = diasAtras(d, inteiro(9, 19));
        const total = [...carrinho].reduce((s, [v, q]) => s + v.price * q, 0);
        const vendedor = rand() < 0.5 ? dona.id : vend.id;
        const [sale] = await query(
          "INSERT INTO sales (store_id, user_id, total, payment_method, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id",
          [store.id, vendedor, total, PAGAMENTOS[inteiro(0, PAGAMENTOS.length - 1)], quando],
          c,
        );
        for (const [v, q] of carrinho) {
          v.qtd -= q;
          await query("INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price) VALUES ($1,$2,$3,$4)", [sale.id, v.id, q, v.price], c);
          await query(
            "INSERT INTO stock_movements (store_id, variant_id, type, quantity, note, sale_id, user_id, created_at) VALUES ($1,$2,'venda',$3,$4,$5,$6,$7)",
            [store.id, v.id, -q, `Venda #${sale.id}`, sale.id, vendedor, quando],
            c,
          );
        }
        vendas++;
      }
    }

    for (const v of variantes) await query("UPDATE variants SET quantity = $1 WHERE id = $2", [v.qtd, v.id], c);
    console.log(`Loja de demonstração criada: ${variantes.length} variantes, ${vendas} vendas em 60 dias.`);
  });

  console.log(`Login: ${DEMO_EMAIL} / ${DEMO_SENHA}  (vendedor: vendedor@arara.demo / ${DEMO_SENHA})`);
  await pool.end();
}

main().catch((e) => {
  console.error("Falha ao popular o banco:", e.message);
  process.exit(1);
});

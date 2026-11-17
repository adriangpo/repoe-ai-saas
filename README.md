# Repõe Aí!

**Estoque por grade, vendas no balcão e reposição inteligente para lojas de roupas, oferecido como SaaS.**

Lojas de roupas pequenas controlam o estoque de cabeça, no caderno ou em planilhas. Como cada peça existe em vários tamanhos e cores, é comum faltar justamente o "M preto" que mais vende, enquanto peças de outra estação ficam paradas ocupando espaço e dinheiro. O Repõe Aí! organiza o estoque por variante (tamanho + cor), baixa o estoque a cada venda e tem um **assistente de reposição** que indica o que repor, quanto comprar e o que colocar em promoção. Esse assistente usa o **JEV** e, se ele não estiver disponível, as regras locais do sistema assumem.

Trabalho da disciplina **Tópicos Especiais em Informática** (FATEC).

## Integrantes

- Adrian Gustavo de Paiva Oliveira
- Pedro Ferreira
- Guilherme Olimpio Rodrigues
- Fábio José Moretão de Souza
- Matheus Pereira Salvador

## Funcionalidades

| Funcionalidade | Como conferir |
|---|---|
| Cadastro da loja (multi-loja/tenant) com login do dono | Criar conta em "Cadastre sua loja" e entrar. |
| Produto com grade gerada automaticamente (tamanhos x cores) | Em *Produtos > Novo produto*, informar `P, M, G` e `Preto, Branco`: são criadas 6 variantes. |
| Venda no balcão com baixa automática do estoque | Em *Vender*, finalizar uma venda: o estoque da variante diminui e aparece no histórico. |
| Bloqueio de venda sem estoque | Tentar vender mais unidades do que existem: a API recusa com "Estoque insuficiente". |
| Entrada de mercadoria e ajuste de inventário | Na página do produto, botões *Entrada* e *Ajuste*; cada mudança fica no histórico. |
| Painel com faturamento, mais vendidos e alertas | Página *Painel*. |
| Assistente de reposição com JEV + fallback por regras | Página *Reposição*: cada item mostra a fonte (JEV ou regras), a urgência e a quantidade sugerida. |
| Equipe com papéis (dono e vendedor) | Vendedor registra vendas, mas não cadastra produtos nem altera o plano. |
| Planos mensais com limites aplicados pela API | Página *Plano*: o Básico permite 1 usuário e 300 variantes e não inclui a IA. |

## Tecnologias

- **Interface:** React 18 + TypeScript + Vite + React Router
- **API:** Node.js + Express 5 + TypeScript, validação com Zod, login com JWT e senhas com bcrypt
- **Banco de dados:** PostgreSQL 17 (Docker Compose), acessado com `pg` e SQL puro
- **IA:** JEV (`systemone`, via OpenRouter), com perguntas **Choice** (ação) e **Score** (urgência)
- **Testes:** Vitest (regras de reposição, interpretação da resposta do JEV e limites dos planos)

## Arquitetura

```
Navegador (React)  --HTTP/JSON-->  API Express  --SQL-->  PostgreSQL
                                        |
                                        +--HTTPS--> JEV (OpenRouter)   [opcional]
                                        |
                                        +--> regras locais (fallback)
```

- `web/`: interface React. Toda chamada passa por `web/src/api.ts`, que envia o token de login.
- `server/src/routes/`: rotas da API (auth, produtos, estoque, vendas, painel, reposição, conta/plano).
- `server/src/services/restock.ts`: regras de reposição (fallback), montagem da consulta ao JEV e interpretação da resposta.
- `server/src/services/jev.ts`: cliente HTTP do JEV. Qualquer falha (sem chave, timeout, HTTP de erro, resposta incompleta) vira `JevUnavailable`, e a rota usa as regras para aquele item.
- `server/src/db/migrations/`: estrutura do banco. Todas as tabelas têm `store_id`: cada loja só enxerga os próprios dados.

## Como executar

Requisitos: **Node.js 20+** e **Docker Desktop** (para o PostgreSQL).

```bash
npm install
npm run setup   # cria o .env, sobe o PostgreSQL, cria as tabelas e a loja de demonstração
npm run dev     # API em http://localhost:3333 e interface em http://localhost:5173
```

Abra **http://localhost:5173** e entre com a loja de demonstração (dados fictícios, criados só no banco local):

- Dona: `dona@repoeai.demo` / `demo1234`
- Vendedor: `vendedor@repoeai.demo` / `demo1234`

Para voltar os dados de demonstração ao estado inicial: `npm run db:seed`.

### Usando o JEV (opcional)

Sem chave, o assistente de reposição funciona com as regras locais. Para ativar a análise com IA, coloque a chave no `.env` e reinicie a API. Vale a chave da OpenRouter ou a chave direta da TypeSafe; o endpoint é escolhido automaticamente:

```
OPENROUTER_API_KEY=sk-or-...     # via OpenRouter
# ou
JEV_API_KEY=...                  # direto na TypeSafe
```

Ao iniciar, a API mostra `JEV: chave configurada (OpenRouter)` ou avisa que vai usar as regras locais.

### Sem Docker

Se você já tem um PostgreSQL instalado, crie um banco vazio e informe a conexão no `.env` antes do `npm run setup`:

```
DATABASE_URL=postgres://usuario:senha@localhost:5432/repoeai
```

### Outros comandos

```bash
npm test          # testes automatizados
npm run build     # gera a versão de produção
npm start         # API servindo também a interface em http://localhost:3333
```

## Segurança

- Nenhuma senha ou chave fica no código: tudo vem do `.env`, que está no `.gitignore`. O `npm run setup` gera valores aleatórios.
- As senhas dos usuários são guardadas com hash bcrypt.
- A chave do JEV fica apenas no servidor e nunca é enviada ao navegador.

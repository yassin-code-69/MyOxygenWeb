# My Oxygen — Project Inventory

Everything the project contains, as of **9 November 2026**. My Oxygen is an online shop for mother-and-baby care products in Bangladesh: a customer storefront, an admin panel and a backend API.

For what is still missing or broken, see [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md).

---

## 1. At a glance

| Item | Count |
|---|---|
| Backend API endpoints | 72 |
| Database tables | 11 (plus 7 enum types) |
| Database migrations | 6 (`0000`–`0005`), all applied to Supabase |
| Backend automated tests | 353 passing, in 28 test files |
| Frontend pages | 34 (11 storefront, 23 admin) |
| Frontend React components | 163 |
| Data hooks | 40 |
| Staff roles / permissions | 6 roles, 13 permissions |

**Git status.** Everything up to the audit fixes and the new database is in commit `c13fcda`, pushed to `main`. The admin-panel redesign, the long-text drawer fix and the button-loader fix are finished but **not committed yet**.

## 2. Architecture

```
my_oxygen/
├── backend/    API server: Bun + Hono + Drizzle ORM + PostgreSQL
├── frontend/   Website: Next.js 16 + React 19 + Mantine 9
├── context/    Original requirements (RULES, SPECIFICATION, phase-01..10)
├── plans/      Implementation plans 005–010
├── docs/       API contract, deployment guide, design mockups, these lists
└── docker-compose.yml, .github/workflows/ci.yml
```

| Layer | Technology |
|---|---|
| Backend runtime | Bun 1.4, Hono 4 (`@hono/node-server`) |
| Database access | Drizzle ORM 0.39, `pg`, drizzle-kit migrations |
| Validation | zod 3 (backend), zod 4 (frontend) |
| Auth | JWT (`jose`), bcrypt password hashing (`bcryptjs`) |
| Background jobs | BullMQ when Redis is configured, otherwise an in-process queue; `node-cron` for schedules |
| PDF | `pdf-lib` (invoices) |
| Frontend | Next.js 16.2 (Turbopack), React 19, Mantine 9.6 (core, form, dates, carousel, charts, spotlight, notifications) |
| Frontend state and data | SWR (server data), zustand (cart, session) |
| Animation and charts | `motion`, Recharts 3 |
| Icons | Tabler icons |
| Database host | Supabase, project `trhxoqxbngqpexrhfvrh`, Singapore, PostgreSQL 17 |

**API conventions.** Every response uses one envelope: `{ success: true, data, meta }` or `{ success: false, error: { code, message, details } }`. Inputs are validated with zod. Lists are paginated. Money is stored in paisa (integers). Business dates use Bangladesh time (`Asia/Dhaka`). The server refuses to start when required settings are missing.

## 3. Database

**Supabase project:** `trhxoqxbngqpexrhfvrh` (ap-southeast-1). The app connects through the pooler on port 6543; migrations use port 5432.

### Tables

| Table | Holds |
|---|---|
| `users` | Customers and staff: name, email, phone (normalized), password hash, role, active flag |
| `categories` | Product categories, with parent/child nesting and sort order |
| `products` | Catalog items: price, sale price, brand, images, description, cost, active and auto-hidden flags |
| `product_batches` | Stock lots with batch number, expiry date and quantity (sold first-expiry-first-out) |
| `discounts` | Coupons and automatic flash sales: percentage or fixed, product or category scope, limits, dates |
| `orders` | Order header: customer, address, totals, delivery fee, status, payment, courier tracking |
| `order_items` | Lines of each order, with price and cost at the time of sale |
| `order_status_history` | Every status change, who made it and when |
| `stock_history_logs` | Stock ledger: every import, sale, return, adjustment and expiry write-off |
| `invoices` | Invoice number, amounts, payment state and generated PDF |
| `expenses` | Business expenses for the profit report (shipping, marketing, delivery subsidy, …) |

**Enum types:** `user_role`, `order_status` (PENDING → PROCESSING → SHIPPED → DELIVERED, plus CANCELLED and REFUNDED), `payment_method` (COD, ONLINE_GATEWAY), `payment_status`, `discount_type`, `stock_history_reason`, `expense_category`.

### Migrations

| # | What it does |
|---|---|
| `0000_baseline` | All tables, enums, keys and indexes |
| `0001_search_and_security` | `pg_trgm` fuzzy search with GIN indexes; Row-Level Security turned on for every table, so the public Supabase API cannot read them |
| `0002_auto_deactivation` | Products hide automatically at 0 stock and come back when restocked; the stock-ledger link to orders is checked at commit |
| `0003_invoice_payment_defaults` | Invoice payment defaults |
| `0004_normalize_user_phones` | One phone format (`01XXXXXXXXX`) for every user |
| `0005_profit_expenses` | Expenses table and the cost fields needed for profit reports |

**Seed data.** `bun run db:seed` creates the categories, the owner account and the development staff accounts. With `SEED_DEMO_CATALOG` it also adds 22 demo products, flash sales and coupons. `db:seed:demo-history` adds months of fake orders, but only on a local database.

## 4. Backend API (72 endpoints)

Full details: [`docs/API_CONTRACT.md`](API_CONTRACT.md) and [`backend/README.md`](../backend/README.md).

| Area | Endpoints |
|---|---|
| **Health** | `GET /health`: deep database check |
| **Auth** | `POST /auth/register`, `/auth/login`, `/auth/refresh`; `GET /auth/me`. Rate limited to 15/min per IP |
| **Public catalog** | Categories (cached 5 min), product search with filters, sort and facets, product detail with related products, running flash sales (cached 30 s) |
| **Customer orders** | Checkout, coupon check, my orders, order detail, invoice PDF, cancel while pending, tracking |
| **Admin: catalog** | Products (list, detail, create, edit, soft delete), categories, brands |
| **Admin: discounts** | Coupons and flash sales (create, edit, deactivate) |
| **Admin: inventory** | Batch inspector, batch import, stock adjustment, stock ledger, low stock, expiring soon |
| **Admin: orders** | List with filters (status, date field, courier), status change, courier dispatch, tracking |
| **Admin: invoices** | List, summary, detail, PDF, generate |
| **Admin: payments and delivery** | Payment summary, delivery summary |
| **Admin: reports** | Dashboard summary, activity feed, products, customers, inventory |
| **Admin: profit** (owner only) | Profit report, profit per product, expenses with category totals |
| **Admin: people** | Customers (list, detail, activate/deactivate), staff (list, create, edit), roles |
| **Admin: system** | Global search (`/admin/search`), system status |

### Business rules built in

- **Stock:** batches are sold first-expiry-first-out; stock is locked during checkout so two buyers cannot take the last item; every movement is written to the ledger.
- **Pricing:** the server always recalculates prices; the more specific discount wins; delivery is free from ৳1,500, otherwise ৳60.
- **Order status:** a state machine allows only valid changes. Refunds also need the `refunds:approve` permission. Cancelling returns the stock.
- **Courier:** a Steadfast integration, plus a mock courier for development; double booking is prevented.
- **Notifications:** SMS (SSL Wireless) and email (Resend) templates for order events. They are skipped when no keys are set.
- **Invoices:** PDF invoices are generated automatically in the background.
- **Scheduled jobs:** a daily expiry scan writes off expired batches; a daily inventory digest email.

## 5. Security and roles

| Role | Can do |
|---|---|
| `SUPER_ADMIN` | Everything, including profit, expenses and staff management |
| `INVENTORY_MANAGER` | Products, batches, stock |
| `ORDER_MANAGER` | Orders, status, courier, invoices, refund requests |
| `MARKETING_MANAGER` | Discounts and flash sales |
| `SUPPORT_STAFF` | Read orders and customers |
| `CUSTOMER` | Own orders only |

**Permissions (13):** `products:read`, `products:write`, `batches:manage`, `stock:adjust`, `orders:read`, `orders:status_update`, `courier:assign`, `invoice:generate`, `refunds:request`, `refunds:approve`, `discounts:manage`, `analytics:read`, `staff:manage`.

**Protections in place:**
- Separate access and refresh tokens; the token type is checked.
- A deactivated user is blocked at once, on login, refresh and every request.
- Login errors do not reveal whether an account exists, and take similar time either way.
- Login rate limiting that a forged `X-Forwarded-For` header cannot bypass.
- Security headers on the API and the website: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy and Permissions-Policy.
- Row-Level Security on every table.
- `.env` files are kept out of git.

## 6. Customer storefront (11 pages)

| Page | Features |
|---|---|
| `/` Home | Hero banner, category grid, live flash-sale banner with countdown, featured products, special-care banner, trust badges |
| `/products` | Search, filters (category, brand, price, in stock), sort, pagination |
| `/categories/[slug]` | Category listing with the same filters |
| `/products/[slug]` | Image gallery (carousel and thumbnails), price and discount, quantity, add to cart, description, specifications, related products |
| `/checkout` | Cart, then three steps (shipping, payment, review), coupon field, free-delivery progress bar, list of Bangladesh districts |
| `/orders` | My orders |
| `/orders/[orderNumber]` | Order detail, status timeline, invoice download, cancel while pending |
| `/orders/[orderNumber]/track` | Delivery tracking |
| `/login`, `/register` | Sign in by email or phone, password strength meter |
| `/account` | Profile and account menu |

**Shared pieces:** navbar with search, cart drawer, mobile header and bottom navigation, footer, page progress bar, page transitions, skeleton loaders, empty states, a custom 404 page and a skip-to-content link. Images fall back gracefully when they fail to load. A one-click demo admin login button appears in development builds only.

## 7. Admin panel (23 pages)

The panel follows the client's three mockups (`docs/design/admin/`) in the My Oxygen colours. The sidebar is grouped; each role sees only what it is allowed to open; global search opens with **Ctrl + K**.

| Section | Pages |
|---|---|
| **Dashboard** | KPI cards with trend, revenue chart, order-status donut, top products, activity feed, quick actions, alerts |
| **Orders** | Status tabs with counts, filters, order detail drawer, status change, courier dispatch, tracking |
| **Customers** | List, detail with order history, activate/deactivate |
| **Products** | All products, add/edit form, detail drawer; categories; brands |
| **Inventory** | Batch inspector, expiry (first-expiry-first-out), stock ledger, batch import, stock adjustment |
| **Delivery & Tracking** | Courier summary and shipments |
| **Marketing** | Coupons and offers (flash sales). Campaigns, Banners and Push Notifications are shown as "coming soon" |
| **Payments** | Transactions, refunds, invoices (detail drawer and PDF), expenses |
| **Reports** | Sales, products, customers, inventory, profit and margin (owner only). Date ranges; CSV export on the product and profit reports |
| **Content** | Pages, Blog and Media are shown as "coming soon" |
| **Settings** | Admin roles (staff management), system status. Store Settings is shown as "coming soon" |

**Admin component kit** (`components/admin/kit`): KPI card, trend badge, area chart, combined bar-and-line chart, donut with legend, progress list, ranked product list, activity feed, quick actions, section card, page header, date-range picker. Also shared: data table, filter bar, confirm dialog, product picker, permission guard and error panels.

## 8. Design system

- **Tokens** in `frontend/tokens/`: colours (brand pink `#FF6B8B`, green focus ring), gradients, shadows, radii, spacing, typography, motion, category visuals. They are output as `--mo-*` CSS variables.
- A Mantine theme built from the tokens. Global styles cover inputs, dropdowns, buttons, skeleton shimmer and scrollbars.
- **Accessibility:** visible keyboard focus ring, skip link, respect for the "reduce motion" setting, and long text that wraps inside drawers and modals.
- **Image settings:** Next.js image optimisation with allowed hosts (including Supabase Storage).

## 9. Testing and quality

| Check | Command | State |
|---|---|---|
| Backend tests (auth, catalog, orders, inventory, courier, invoices, notifications, queue, reports, every admin route, rate limiter, env) | `cd backend && bun run test` | 353 passing |
| Backend type check | `bun run typecheck` | Clean |
| Migration drift check | `bun run db:check` | Clean |
| Frontend type check | `cd frontend && bun run typecheck` | Clean |
| Frontend lint (oxlint) | `bun run lint` | Clean |
| Frontend production build | `bun run build` | Builds (see the font-cache note in KNOWN_ISSUES #32) |

Tests run against a separate local Postgres in Docker (`bun run test:db:up`, port 54329), never against Supabase. There are no frontend automated tests yet.

## 10. DevOps and deployment

- **Production:** the API runs on Railway (Singapore) and the website on Vercel at `www.myoxygen.life`; both deploy from `main`. See [`DEPLOYMENT.md`](DEPLOYMENT.md#current-production-railway--vercel).
- **Docker:** `backend/Dockerfile`, `frontend/Dockerfile` (standalone Next.js output), and `docker-compose.yml` with `redis`, `migrate`, `backend`, `frontend` and `test-db` services.
- **CI** (`.github/workflows/ci.yml`): the backend job runs the type check, migration check, drift check, migrations and tests; the frontend job runs the type check, lint and build; a third job builds the Docker images.
- **Deployment guide:** [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) covers environment variables, migrations, first owner account and the go-live checklist.
- **Settings:** `backend/.env` and `frontend/.env.local` for Supabase; `backend/.env.test` for tests. Examples are in the `.env.example` files.

## 11. Documentation

| File | Contents |
|---|---|
| `README.md` | Setup, commands, admin panel overview, development accounts, troubleshooting |
| `backend/README.md` | Backend setup and the full endpoint table |
| `docs/API_CONTRACT.md` | Request and response shapes for every endpoint |
| `docs/DEPLOYMENT.md` | How to deploy and go live |
| `docs/KNOWN_ISSUES.md` | Open problems, by priority |
| `docs/PROJECT_INVENTORY.md` | This file |
| `docs/design/admin/*.png` | The client's three admin mockups |
| `context/` | Original requirements: RULES, SPECIFICATION, phase-01 to phase-10 |
| `plans/` | Implementation plans 005–010 and a remediation note |

## 12. Everyday commands

| Task | Command |
|---|---|
| Start backend (port 4000) | `cd backend && bun run dev` |
| Start website (port 3000) | `cd frontend && bun run dev` |
| Apply migrations | `cd backend && bun run db:migrate` |
| Seed data | `cd backend && bun run db:seed` |
| Database browser | `cd backend && bun run db:studio` |
| Test database up / down / reset | `bun run test:db:up` / `test:db:down` / `test:db:reset` |
| Run backend tests | `cd backend && bun run test` |
| Production build | `cd frontend && bun run build` then `bun run start` |

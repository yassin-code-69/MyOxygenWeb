# My Oxygen — Industrial E-Commerce System Specification

**Version:** 1.0.0-Production  
**Architecture:** Decoupled 3-Folder Structure (`backend/`, `frontend/`, `context/`)  
**Deployment Target:** Docker Containerized (Bun + Hono.js API, Next.js 16 Storefront, Supabase PostgreSQL)  
**Brand Identity:** Single-Owner Retail Mother & Baby Care Brand in Bangladesh  

---

## 1. Core Architecture & Folder Invariants

- **`backend/`**: Independent Bun + Hono.js RESTful API using Drizzle ORM connected to Supabase PostgreSQL (Tokyo pooler `aws-0-ap-northeast-1.pooler.supabase.com:6543`).
- **`frontend/`**: Independent Next.js 16 (Turbopack) + React 19 + Mantine 9 Storefront and Back-Office.
- **`context/`**: Architecture blueprints, phase requirements, and development rules.
- **Decoupled Constraint**: Strictly **NO monorepo workspaces**, **NO `pnpm-workspace.yaml`**, **NO Turborepo**, and **NO shared `packages/`**.
- **Single-Owner Constraint**: Exclusively single-owner retail mother & baby care brand. Multi-vendor or merchant marketplace logic is prohibited.

---

## 2. Design Tokens & Visual Language

- **Primary Pink:** `#FF6B8B` (Action buttons, brand highlights, active badges)
- **Secondary Green:** `#4CAF7D` (Headers, trust icons, stock confirmations)
- **Accent Purple:** `#A78BFA` (Category accents, promotional tags)
- **Cream Background:** `#FFF8F6` (Global page canvas)
- **Surface White:** `#FFFFFF` (Elevated product cards and container surfaces)
- **Dark Text:** `#1F2937` (Headings, primary high-contrast text)
- **Text Gray:** `#6B7280` (Body copy, muted captions, placeholders)
- **Skeleton Shimmer:** `#FDE8EC` to `#FFF5F8` (Warm rose cream shimmer, eliminating black/dark skeletons)
- **Currency:** Bangladeshi Taka `৳` (BDT)

---

## 3. Implemented Phases (1 through 10)

1. **Phase 1: Database Architecture & Supabase Drizzle Schemas**:
   - `users`, `categories`, `products`, `product_batches`, `stock_history_logs`, `discounts`, `orders`, `order_items`.
2. **Phase 2: Authentication & Granular RBAC Engine**:
   - `jose` JWT signing & verification with pinned `HS256` and `tokenType: "access" | "refresh"`.
   - 13-permission RBAC engine with Super Admin wildcard bypass.
3. **Phase 3: Inventory Intelligence & FEFO Perishable Engine**:
   - First-Expired, First-Out allocation (`expiryDate ASC`), row-level locks (`SELECT FOR UPDATE`), zero-stock auto-deactivation, and nightly 02:00 Asia/Dhaka expiry cron.
4. **Phase 4: Catalog Discovery, Trigram Fuzzy Search & Flash Sales**:
   - PostgreSQL `pg_trgm` GIN indexes, trigram fuzzy search ranking, and flash sale effective price calculation.
5. **Phase 5: Design System & Mantine 9 Tokenization**:
   - BrandButton, ProductCard, ProductCardSkeleton, CountDownTimer, StatusBadge, and Mantine Notifications.
6. **Phase 6: Storefront Pages & Catalog Explorer**:
   - SWR data fetching, category landing pages, product explorer with search and price filter, and PDP with batch transparency alert.
7. **Phase 7: Purchase Funnel, Zustand Cart Store & 3-Step Checkout**:
   - Persisted Zustand cart store, animated 3-step checkout with Bangladesh mobile regex `01[3-9]\d{8}`, and atomic FEFO order creation.
8. **Phase 8: Steadfast Logistics, PDF Invoices & Notification Hub**:
   - Steadfast Courier adapter with sandbox fallback, `pdf-lib` branded A4 invoice streaming, and multi-channel (HTML email + SSL Wireless SMS) fire-and-forget notification hub.
9. **Phase 9: Admin Back-Office Portal**:
   - Overview Telemetry Dashboard, Products Catalog CRUD manager, Orders fulfillment table with courier dispatch, Batch Inspector with color-coded shelf-life warnings, and Stock Audit Ledger.
10. **Phase 10: Concurrency Hardening & Docker Containerization**:
    - 10-concurrent-requests FEFO race condition stress testing (5 win, 5 reject, stock exactly 0), `/health` deep database diagnostics, multi-stage Dockerfiles (`backend/Dockerfile`, `frontend/Dockerfile`), and `docker-compose.yml`.

---

## 4. UI/UX Enhancements & Mobile Alignment

- **Theme Hardening**: Enforced `forceColorScheme="light"` across MantineProvider to eliminate unintentional dark mode overrides.
- **Top Loading Progress Bar (`PageProgressBar.tsx`)**: Glowing `#FF6B8B` progress bar at the top of the viewport on route transitions.
- **Lightweight Motion (`AnimatedSection.tsx`)**: Viewport-triggered scroll reveals using `motion/react` with spring physics.
- **Mobile Storefront (`mobile view.jpeg`)**:
  - Peach gradient top bar (`#FFF1ED` to `#FFE3DA`) with Dhaka location selector and reward points badge.
  - Circular category icon strip (Newborn, Mother Care, Skincare, Inner Wear).
  - Floating search pill with category grid action and camera icon.
  - Responsive 2-column product card grid.
  - Sticky frosted-glass bottom navigation bar (`MobileBottomNav.tsx`).

---

## 5. Developer & Testing Shortcuts

- **Seeded Super Admin Credentials**:
  - Email: `admin@myoxygen.com`
  - Password: `Admin@MyOxygen2026`
  - Role: `SUPER_ADMIN`
- **1-Click Dev Admin Login**:
  - Available on `/login` and desktop Navbar (`⚡ Dev Admin`).
  - Automatically logs in via `POST /auth/login`, persists JWT tokens in `auth-store`, and redirects directly to `/admin`.

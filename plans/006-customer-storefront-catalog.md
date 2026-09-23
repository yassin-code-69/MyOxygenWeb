# Plan 006: Customer Storefront Pages, Catalog Explorer & Detail Page

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Working directory**: `/home/jaber/Documents/job/my_oxygen/frontend`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/005-design-system-motion-ui.md
- **Category**: direction | dx
- **Planned at**: 2026-09-22

---

## Why this matters

Phase 6 constructs the complete Customer Web Storefront for My Oxygen — the primary surface every customer encounters. It provides catalog exploration, category navigation, trigram fuzzy search integration, and slug-based Product Detail Pages (PDP) with full perishable batch transparency (displaying the earliest batch expiry date and live stock levels to build maternal trust).

---

## Current state

- Working directory: `frontend/`
- Next.js 16.2.2 App Router with Mantine 9.6.1.
- Plan 005 establishes design tokens, Mantine theme, `BrandButton`, `ProductCard`, and `ProductCardSkeleton`.
- Backend catalog endpoints are live on port 4000:
  - `GET /catalog/products` (supports `q`, `categorySlug`, `minPrice`, `maxPrice`, `inStockOnly`, `sort`, `page`, `limit`)
  - `GET /catalog/products/:idOrSlug` (returns product detail + batch expiry details)

---

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install deps | `bun add swr` | exit 0 |
| Typecheck | `bun x tsc --noEmit` | exit 0, zero errors |
| Build | `bun run build` | exit 0, compiled successfully |

---

## Scope

**In scope**:
- `frontend/package.json` (add `swr`)
- `frontend/lib/api-client.ts` (typed HTTP client)
- `frontend/hooks/use-products.ts` (SWR hook for catalog listing with filtering and pagination)
- `frontend/hooks/use-product-detail.ts` (SWR hook for product detail)
- `frontend/app/products/page.tsx` (Catalog explorer with filter sidebar, sort, responsive grid, pagination)
- `frontend/app/products/[slug]/page.tsx` (Product Detail Page with batch transparency, quantity selector, add-to-cart)
- `frontend/app/categories/[slug]/page.tsx` (Category landing page)

**Out of scope**:
- Do NOT touch `backend/`.
- Cart and checkout pages belong to Plan 007.

---

## Steps

### Step 1: Install SWR & Create API Client

Install SWR:
```bash
bun add swr
```

Create `frontend/lib/api-client.ts`:
- Reads `process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"`.
- Surfaces custom `ApiError` (status, code, message).
- Injects JWT `Bearer` token from `localStorage` (key: `"my_oxygen_token"`).
- Exports `apiGet<T>(path: string, params?: Record<string, any>)` and `apiPost<T>(path: string, body?: any)`.

**Verify**: `bun x tsc --noEmit` passes.

### Step 2: Create Data Fetching Hooks

1. **`frontend/hooks/use-products.ts`**:
   - Accepts filter state: `{ q?: string, categorySlug?: string, minPrice?: number, maxPrice?: number, inStockOnly?: boolean, sort?: string, page?: number, limit?: number }`.
   - Uses SWR with key `['/catalog/products', filterParams]`.
   - Returns `{ products, meta, isLoading, isError, mutate }`.

2. **`frontend/hooks/use-product-detail.ts`**:
   - Accepts `idOrSlug: string`.
   - Fetches from `/catalog/products/${idOrSlug}`.
   - Returns `{ product, earliestExpiryDate, totalAvailableStock, isLoading, isError }`.

**Verify**: `bun x tsc --noEmit` passes.

### Step 3: Implement Catalog Explorer Page (`frontend/app/products/page.tsx`)

Layout:
- **Header**: Breadcrumbs (Home > Products), Title ("All Products" or Category Name), Search Input (with debounced trigram search), Sort dropdown (`newest`, `price_asc`, `price_desc`, `popularity`).
- **Sidebar**:
  - Category selector radio/pills (All, Newborn, Mother Care, Skin Care, Inner Wear).
  - Price Range Slider (৳0 to ৳5,000).
  - "In Stock Only" Mantine Switch.
  - "Clear Filters" Button.
- **Product Grid**:
  - When loading: Grid of 8 `ProductCardSkeleton` components.
  - When loaded: Grid of `ProductCard` components with motion stagger animation.
  - Empty state: Clean illustrated banner ("No products match your filters").
- **Pagination**: Centered Mantine `<Pagination />`.

**Verify**: `bun run build` passes.

### Step 4: Implement Product Detail Page (`frontend/app/products/[slug]/page.tsx`)

Dynamic route with Client Component:
- **Left Column**: Product image gallery (main hero image + thumbnail selection, rounded `lg`, subtle shadow).
- **Right Column**:
  - Category tag & Brand badge.
  - Title (Poppins 2rem bold).
  - SKU & Star rating display.
  - **Batch Transparency Alert**:
    - If `requiresBatchTracking` is true: Mantine Alert in `#E8F8F0` (light green) with `@tabler/icons-react` `IconShieldCheck`:
      - "Guaranteed Fresh: Earliest Batch Expires [Month Year] • [N] Units In Stock"
  - Price display: `৳ {effectivePrice}` (bold `#FF6B8B`) with struck-through original price and discount percentage badge.
  - Quantity selector: Mantine `NumberInput` with `-` and `+` buttons (min 1, max available quantity or 10).
  - Action buttons: "Add to Cart" (Primary Pink CTA) and "Buy Now" (Secondary Green CTA).
  - Value propositions: 100% Authentic Guaranteed, Free Delivery over ৳1,500, Easy Returns.
  - Tabs: "Description", "Specifications / Ingredients", "Batch & Quality Control", "Delivery & Returns".

**Verify**: `bun x tsc --noEmit` exits 0.

### Step 5: Implement Category Landing Page (`frontend/app/categories/[slug]/page.tsx`)

- Reuses the catalog explorer with the `categorySlug` prop pinned to the URL parameter.
- Includes category banner with tailored headline and description.

**Verify**: `bun run build` succeeds cleanly.

---

## Done criteria

- [ ] `bun x tsc --noEmit` exits 0 with zero type errors.
- [ ] `bun run build` compiles all static and dynamic routes (`/products`, `/products/[slug]`, `/categories/[slug]`).
- [ ] Batch transparency notice renders prominently on perishable items.
- [ ] Trigram search input binds cleanly to the backend API query parameter `q`.
- [ ] `plans/README.md` status row for Plan 006 is updated to `DONE`.

---

## STOP conditions

- If Next.js 16 App Router produces SSR hydration mismatches with SWR, wrap client fetching components in `"use client"` directive.
- Stop and report if backend catalog endpoint response structure diverges from `{ success: true, data: [...], meta: {...} }`.

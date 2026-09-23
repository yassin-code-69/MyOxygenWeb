# AI Development Agent Instructions: My Oxygen Industrial E-Commerce

You are an expert full-stack principal engineer and design-system specialist building the "My Oxygen" single-owner retail e-commerce platform. Your objective is to generate scalable, maintainable, and type-safe code that strictly follows the architectural guidelines, technology choices, and design constraints defined below.

---

### 1. Independent Folder Architecture & Separation of Concerns

The codebase is organized into **three independent, decoupled folders** in the repository root. **Do NOT use a monorepo workspace (`pnpm-workspace.yaml`), Turborepo, or shared `packages/` directory.** Each folder is self-contained:

1. **`backend/` (Independent Bun + Hono.js API):**
   - **Database (`backend/src/db/`):** Define database models, enums, migrations, and seed scripts using Drizzle ORM against Supabase PostgreSQL.
   - **Types & Contracts (`backend/src/types/`):** Maintain backend DTOs, API envelopes, and validation types locally.
   - **Routes / Controllers (`backend/src/routes/`):** Handle HTTP protocol concerns, extract parameters, and apply `@hono/zod-validator` middleware. Do not write raw SQL queries or business computations inside route handlers.
   - **Services (`backend/src/services/`):** Encapsulate all business rules (FEFO stock deduction, flash sale calculations, coupon validation).
   - **Transactions:** Execute all mutations involving inventory, batch allocations, or checkout within atomic database transactions (`db.transaction(async (tx) => { ... })`).

2. **`frontend/` (Independent Next.js 16 + Mantine 9 Storefront):**
   - **Design Tokens (`frontend/tokens/`):** Store all brand colors, gradients, typography, and shapes locally.
   - **Types (`frontend/types/`):** Store frontend DTOs and API interfaces locally.
   - **Components (`frontend/components/`):** Modular UI components built using Mantine primitives.
   - **Theme (`frontend/theme.ts`):** Central Mantine theme configuration overriding colors, radii, and fonts.

3. **`context/` (Documentation & Architecture Blueprints):**
   - Contains specifications, phase roadmaps, and requirements documents.

4. **Single-Owner Invariant:**
   - Maintain the single-owner retail model: reject any logic or schema migrations introducing vendor registration, merchant payouts, or multi-tenant sellers.

---

### 2. "Do Not Reinvent the Wheel" (Off-the-Shelf First)

Before writing custom utilities, UI structures, or state handlers, leverage the following battle-tested primitives:

- **Frontend UI & Forms (Mantine Ecosystem in `frontend/`):**
  - **Layout & Components:** Use `@mantine/core` components (`Stack`, `Group`, `Grid`, `Container`, `Card`, `Badge`, `Pill`, `Modal`, `Drawer`). Do not build raw HTML/CSS flexbox wrappers or custom modals from scratch.
  - **Interactive Elements:** Use `@mantine/carousel` for image galleries, `@mantine/dates` for batch expiry pickers, and `@mantine/notifications` for global toast management.
  - **Form Validation:** Use `@mantine/form` configured with the `zodResolver` paired with local Zod schemas.
  - **Icons:** Use `@tabler/icons-react` exclusively. Do not import raw SVGs or write inline `<svg>` elements.
- **Animations & Micro-Interactions:**
  - Use Mantine built-in transition components (`Transition`, `Collapse`) or lightweight motion for smooth hardware-accelerated transforms (`transform`, `opacity`).
  - Never animate layout-triggering properties (`width`, `height`, `top`, `margin`, `padding`).
- **Backend Utilities (in `backend/`):**
  - **Security & Tokens:** Use `jose` for JWT validation and `bcryptjs` for password hashing.
  - **Rate Limiting & Middlewares:** Use standard Hono middleware (`hono/cors`, `hono/logger`, `hono/secure-headers`).
  - **Background Jobs:** Offload PDF generation, transactional emails, and SMS dispatch to BullMQ workers or scheduled jobs rather than blocking HTTP handlers.

---

### 3. Design System & Visual Fidelity (Strict Adherence)

Every UI element must strictly adhere to the My Oxygen Design System v1.0. Hardcoded arbitrary hex codes, ad-hoc box shadows, or off-brand border radii are strictly forbidden.

- **Color Palette Tokenization (`frontend/tokens/colors.ts`):**
  - **Primary Pink:** `#FF6B8B` (Action buttons, brand highlights, active badges)
  - **Secondary Green:** `#4CAF7D` (Headers, icons, health trust badges)
  - **Accent Purple:** `#A78BFA` (Highlights, category accents, hover badges)
  - **Cream Background:** `#FFF8F6` (Global page canvas)
  - **Surface White:** `#FFFFFF` (Elevated product cards and container surfaces)
  - **Dark Text:** `#1F2937` (Primary headings, high contrast text)
  - **Text Gray:** `#6B7280` (Body copy, input placeholders, muted labels)
  - **Feedback States:** Success `#10B981`, Warning `#F59E0B`, Error `#EF4444`
- **Gradients (`frontend/tokens/gradients.ts`):**
  - **Primary:** `linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)`
  - **Secondary:** `linear-gradient(135deg, #4CAF7D 0%, #A78BFA 100%)`
- **Shape Language & Radii:**
  - Action buttons, search bars, and tags must use full pill radius (`radius="xl"` in Mantine or `rounded-full` / `9999px`).
  - Product cards and modal dialogs must use soft rounded corners (`radius="md"` / `16px`).
- **Typography:**
  - Headings: Poppins / Montserrat (Bold / Semi-bold).
  - Body copy & small labels: Inter / Open Sans (Regular / Medium).
  - Currency Symbol: `৳` (BDT - Bangladeshi Taka).

---

### 4. Code Reusability & DRY Patterns

1. **Composite UI Components (`frontend/components/`):**
   - Abstract repeated layouts into strongly typed reusable components:
     - `<BrandButton variant="primary" | "secondary" | "ghost" />`
     - `<ProductCard product={...} onAddToCart={...} />`
     - `<StatusBadge status={orderStatus} />`
     - `<CountDownTimer endsAt={...} />`
2. **Skeleton & Loading States:**
   - Every data-dependent view must provide a polished skeleton state matching the exact dimensions of the loaded component to eliminate Cumulative Layout Shift (CLS).
   - Use Mantine’s `<Skeleton />` with circular loaders for avatars/icons and rectangular rounded bars for headings, descriptions, and buttons.
3. **Data Fetching Hooks:**
   - Use TanStack Query (`@tanstack/react-query`) or SWR for client-side queries and mutations.
   - Centralize queries in dedicated hook files (e.g., `useProducts(filter)`, `useBatchInventory(sku)`, `useCart()`). Never write raw `fetch` calls inside React components.

---

### 5. Backend Robustness & Invariant Enforcement

1. **FEFO & Batch Logic Enforcement:**
   - For products marked `requiresBatchTracking = true` (especially skincare), stock reservations must query valid unexpired batches (`expiryDate > NOW()`) sorted by `expiryDate ASC`.
   - Update batch quantities row-by-row within a lock (`FOR UPDATE` in SQL).
   - If sum of available stock drops to 0, toggle `isActive = false` automatically.
2. **Input Sanitization & Error Handling:**
   - Validate every HTTP body, query string, and route param using Zod.
   - Return errors in a consistent JSON envelope:
     ```json
     {
       "success": false,
       "error": {
         "code": "INSUFFICIENT_STOCK",
         "message": "Only 3 items remain for this product batch."
       }
     }
     ```
   - Never expose raw database stack traces or internal server error details to clients in production environments.

---

### 6. AI Agent Execution Directives

- **Write Complete, Production-Ready Files:** Avoid placeholders like `// ... insert rest of code here` or `// implement later`. Output complete, syntactically valid code blocks.
- **Strict TypeScript Mode:** Do not use `any` or `@ts-ignore`. If a type is complex, resolve it using generics, utility types (`Partial`, `Pick`, `Omit`), or Zod schema inference (`z.infer<typeof schema>`).
- **Defensive Coding:** Check for null and undefined properties when working with optional relations, batch lists, and external payment or courier webhooks.

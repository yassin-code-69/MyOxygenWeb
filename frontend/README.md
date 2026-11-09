# My Oxygen — Frontend

Next.js 16 storefront and back-office for My Oxygen: home and category landing pages, product explorer with search and filters, product detail with batch-expiry transparency, cart and 3-step checkout, order tracking, and the staff portal under `/admin` (overview, products, orders, batches, invoices, stock ledger).

It talks to the [backend API](../backend/README.md) directly from the browser. Setup for the whole repository is in the [root README](../README.md).

```bash
bun install
cp .env.example .env.local   # NEXT_PUBLIC_API_URL=http://localhost:4000
bun run dev                  # http://localhost:3000
```

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, `output: "standalone"`), React 19 |
| UI kit | Mantine 9 (`@mantine/core`, `carousel`, `dates`, `form`, `notifications`, `hooks`) — light scheme forced |
| Icons | `@tabler/icons-react` only |
| Motion | Mantine transitions, `motion` (`motion/react`) for transform/opacity animations |
| Server data | SWR hooks in `hooks/` on top of `lib/api-client.ts` |
| Client state | Zustand with `persist` — cart (`my_oxygen_cart`) and auth session (`my_oxygen_auth`) |
| Forms | `@mantine/form` + Zod 4 via `mantine-form-zod-resolver` |
| Tooling | TypeScript strict, oxlint (`oxc-config-mantine`), PostCSS with `postcss-preset-mantine` |
| Runtime | Node.js ≥ 20.9 (24 LTS in Docker/CI); Bun as package manager and script runner |

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` | Dev server on `:3000` |
| `bun run build` | `next build` (type-checks) → `.next/standalone`, then copies `public/` and `.next/static` into it |
| `bun run start` | Run the standalone server: `node .next/standalone/server.js` |
| `bun run start:next` | `next start` |
| `bun run typecheck` | `next typegen` (route types) + `tsc --noEmit` |
| `bun run lint` | `oxlint -c oxlint.config.mjs .` |

CI runs `typecheck`, `lint` and `build` on every pull request.

## Environment

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | Browser-facing origin of the backend API, no trailing slash (e.g. `https://api.myoxygen.com.bd`). |

`NEXT_PUBLIC_*` values are **inlined into the JavaScript bundle at build time**. Changing the API URL means rebuilding (`docker build --build-arg NEXT_PUBLIC_API_URL=...`); setting it on a running container has no effect on client code. Never put secrets in `NEXT_PUBLIC_*` variables. Env files (`.env`, `.env.local`, …) are git-ignored; only `.env.example` is committed.

The backend must list this app's origin in its `CORS_ORIGIN`.

## Folder structure

```
frontend/
├── app/                    App Router routes
│   ├── page.tsx            home
│   ├── products/           explorer + [slug] detail
│   ├── categories/[slug]/  category landing pages
│   ├── checkout/           3-step checkout
│   ├── orders/[orderNumber]/ order tracking
│   ├── login/ register/    authentication
│   ├── admin/              back-office (overview, products, orders, batches, invoices, ledger)
│   └── layout.tsx          MantineProvider, fonts, notifications, progress bar, mobile nav
├── components/             composite UI (BrandButton, ProductCard, StatusBadge, CountDownTimer, …)
├── hooks/                  SWR data hooks (useProducts, useProductDetail, …)
├── lib/                    api-client, Zustand stores (auth, cart), animation presets
├── tokens/                 design tokens (single source of truth for visual values)
├── types/                  frontend DTOs mirroring the API envelope
├── theme.ts                Mantine theme built from the tokens
└── public/                 static images and category icons
```

## Design tokens

All visual values live in [`tokens/`](tokens) and flow into the Mantine theme in [`theme.ts`](theme.ts):

| File | Contents |
|---|---|
| `tokens/colors.ts` | Brand palette (primary pink `#FF6B8B`, secondary green `#4CAF7D`, accent purple `#A78BFA`, cream canvas, surfaces, text), semantic states, Mantine color scales |
| `tokens/gradients.ts` | Primary / secondary brand gradients |
| `tokens/typography.ts` | Font families (Poppins headings, Inter body), weights, currency (`৳`) |
| `tokens/shapes.ts` | Radii (pill `xl` for buttons/inputs/tags, `md` for cards/modals), aspect ratios, z-index |
| `tokens/spacing.ts`, `shadows.ts`, `motion.ts` | Spacing scale, elevation, durations/easings/springs |
| `tokens/css-variables.ts` | CSS custom properties generated from the tokens |
| `tokens/categories.ts`, `trustBadges.ts` | Content tokens for category tiles and trust badges |

The design system is defined in [`context/RULES.md`](../context/RULES.md) §3.

## Conventions

- **Mantine primitives first** — layout with `Stack`, `Group`, `Grid`, `Container`; surfaces with `Card`, `Paper`, `Modal`, `Drawer`; feedback with `@mantine/notifications`. No hand-rolled flex wrappers or custom modals.
- **Tokens, not hex** — never hard-code colors, shadows or radii in components; import from `tokens/` or use theme values (`color="primaryPink"`, `radius="xl"`). Buttons, search bars and tags use the pill radius; cards and modals `md`.
- **Icons** — `@tabler/icons-react` only; no raw SVG imports or inline `<svg>`.
- **Data fetching** — components never call `fetch` directly. Add a hook in `hooks/` (SWR) that uses `apiGet`/`apiPost`/… from `lib/api-client.ts`; the client prefixes `NEXT_PUBLIC_API_URL`, attaches the bearer token, returns the parsed `{ success, data, meta }` envelope and throws `ApiError` (`status`, `code`, `details`) for non-2xx responses.
- **Forms** — `@mantine/form` with `zodResolver` and a local Zod schema; surface API `VALIDATION_ERROR` `details.fieldErrors` on the matching fields. Bangladeshi mobile numbers match `01[3-9]\d{8}`.
- **Loading states** — every data-driven view ships a skeleton with the final layout's dimensions (warm rose shimmer, no dark skeletons) to avoid layout shift.
- **Motion** — animate `transform` and `opacity` only; never width/height/top/margin/padding.
- **Types** — strict TypeScript, no `any` or `@ts-ignore` in new code; DTOs in `types/`.
- **Money** — display BDT with the `৳` symbol from the typography tokens.

## Docker

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.com -t my-oxygen-frontend .
docker run -p 3000:3000 my-oxygen-frontend
```

Multi-stage build (Bun install → `next build` → `node:24-alpine` runner as non-root user `nextjs`, with a `HEALTHCHECK` on `/`). The build fails if `NEXT_PUBLIC_API_URL` is not provided. `next/font` downloads Google Fonts at build time, so the build needs outbound HTTPS. See [`docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

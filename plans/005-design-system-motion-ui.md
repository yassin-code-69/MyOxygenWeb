# Plan 005: Design System Tokenization, Mantine 9 Theme & Motion Primitives

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Working directory**: `/home/jaber/Documents/job/my_oxygen/frontend`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (Phases 1-4 completed)
- **Category**: dx | tech-debt
- **Planned at**: 2026-09-22

---

## Why this matters

Phase 5 wires the My Oxygen design system directly into the independent Next.js 16 storefront application. It establishes the Mantine 9 theme as the single source of truth for every color, radius, shadow, and component style — ensuring that the strict brand palette (`#FF6B8B` primary pink, `#4CAF7D` secondary green, `#A78BFA` accent purple, `#FFF8F6` cream canvas) is enforced at the token level without drift across components.

Alongside the theme, Phase 5 provides an animation architecture using `motion/react` that gives every interactive surface (buttons, cards, skeletons, countdown timers) a consistent, production-grade micro-interaction feel while respecting Core Web Vitals (hardware-accelerated `transform` and `opacity` only).

---

## Current state

- Working directory: `frontend/`
- Framework: Next.js 16.2.2 with App Router, Mantine 9.6.1, React 19.2.4.
- Existing tokens: `frontend/tokens/` contains `colors.ts`, `gradients.ts`, `shapes.ts`, `typography.ts`, `categories.ts`, `trustBadges.ts`.
- Existing theme: `frontend/theme.ts` initializes Mantine theme with `myPink`, `myGreen`, `myPurple`.
- Existing components: `Navbar.tsx`, `HeroBanner.tsx`, `FeaturesBar.tsx`, `CategoryGrid.tsx`, `FeaturedProducts.tsx`, `SpecialCareBanner.tsx`, `Footer.tsx`, `MobileBottomNav.tsx`.

---

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install deps | `bun add motion @mantine/notifications` | exit 0 |
| Typecheck | `bun x tsc --noEmit` | exit 0, zero errors |
| Build | `bun run build` | exit 0, compiled successfully |

---

## Scope

**In scope** (the only files you should modify or create):
- `frontend/package.json` (add `motion` and `@mantine/notifications`)
- `frontend/lib/animations.ts` (Motion variants: `fadeInUp`, `staggerContainer`, `cardHover`, `pageTransition`, `pulseAttention`, `pillBounce`)
- `frontend/components/BrandButton.tsx` (reusable pill CTA button with motion tap)
- `frontend/components/ProductCard.tsx` (enhanced with motion hover, discount pill, batch expiry notice, Add to Cart trigger)
- `frontend/components/ProductCardSkeleton.tsx` (zero-CLS skeleton mirroring `ProductCard` dimensions)
- `frontend/components/CountDownTimer.tsx` (flash sale countdown with hours/minutes/seconds blocks)
- `frontend/components/StatusBadge.tsx` (status pills for order/stock states)
- `frontend/app/layout.tsx` (include Mantine `Notifications` container)

**Out of scope**:
- Do NOT touch `backend/` or any file outside `frontend/`.
- Do NOT add monorepo workspace dependencies (`workspace:*`).

---

## Steps

### Step 1: Install Motion and Mantine Notifications

Install `motion` (for `motion/react`) and `@mantine/notifications`:
```bash
bun add motion @mantine/notifications
```

**Verify**: Check `package.json` includes `motion` and `@mantine/notifications`.

### Step 2: Create Motion Animation Presets (`frontend/lib/animations.ts`)

Export hardware-accelerated variants:
- `fadeInUp`: `initial: { opacity: 0, y: 16 }`, `animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } }`
- `staggerContainer`: `animate: { transition: { staggerChildren: 0.08 } }`
- `cardHover`: `whileHover: { y: -4, transition: { duration: 0.2 } }`
- `tapBounce`: `whileTap: { scale: 0.97 }`
- `pulseAttention`: `animate: { scale: [1, 1.04, 1], transition: { repeat: Infinity, duration: 2 } }`

**Verify**: `bun x tsc --noEmit` passes.

### Step 3: Implement Reusable UI Primitives

1. **`frontend/components/BrandButton.tsx`**:
   - Uses Mantine `Button` wrapped with `motion.button` or motion tap.
   - Props: `variant?: "primary" | "secondary" | "accent" | "ghost"`, `size?: "xs" | "sm" | "md" | "lg"`, `radius?: "xl"`, `loading?: boolean`, children, onClick.
   - Gradients:
     - `primary`: `linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)`
     - `secondary`: `linear-gradient(135deg, #4CAF7D 0%, #A78BFA 100%)`
     - `accent`: `#A78BFA`

2. **`frontend/components/ProductCard.tsx` & `ProductCardSkeleton.tsx`**:
   - `ProductCard`:
     - Image with aspect ratio 1:1, hover zoom (`scale: 1.05`).
     - Discount pill (e.g. `20% OFF` in `#FF6B8B`).
     - Perishable batch info: "Exp: Mar 2027" badge when `requiresBatchTracking` is true.
     - Price display: `৳ {effectivePrice}` and struck-through `৳ {basePrice}` if discounted.
     - Add to Cart `BrandButton` with cart icon.
   - `ProductCardSkeleton`:
     - Mirror dimensions exactly: `<Skeleton height={220} radius="md" />`, `<Skeleton height={16} width="80%" mt="sm" />`, `<Skeleton height={14} width="40%" mt="xs" />`, `<Skeleton height={36} radius="xl" mt="md" />`.

3. **`frontend/components/CountDownTimer.tsx`**:
   - Calculates remaining hours, minutes, seconds from an `endsAt: Date | string` prop.
   - Renders 3 rounded boxes with primary pink border / cream background.
   - Updates every 1000ms.

4. **`frontend/components/StatusBadge.tsx`**:
   - Maps statuses (`PENDING`, `PROCESSING`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `LOW_STOCK`, `EXPIRING_SOON`) to appropriate colors (`yellow`, `blue`, `cyan`, `green`, `red`, `orange`).

**Verify**: `bun x tsc --noEmit` exits with 0 errors.

### Step 4: Add Notifications Provider to App Layout

Update `frontend/app/layout.tsx` to include `<Notifications position="top-right" />` inside `<MantineProvider>`.

**Verify**: `bun run build` exits 0.

---

## Done criteria

- [x] `bun x tsc --noEmit` in `frontend/` exits 0 with zero errors.
- [x] `bun run build` in `frontend/` succeeds cleanly.
- [x] All components (`BrandButton`, `ProductCard`, `ProductCardSkeleton`, `CountDownTimer`, `StatusBadge`) are exported and type-safe.
- [x] No layout-thrashing animations; only `transform` and `opacity` are animated.
- [x] `plans/README.md` status row for Plan 005 is updated to `DONE`.

---

## STOP conditions

- If Mantine 9 causes React 19 peer-dependency warnings that break compilation, report back immediately.
- If any build tool requests monorepo packages, check `RULES.md` — everything must reside locally inside `frontend/`.

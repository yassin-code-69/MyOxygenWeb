### Phase 6 Context & Architecture Blueprint

Phase 6 constructs the complete **Customer Web Storefront** for the **My Oxygen** e-commerce platform — the primary surface every customer encounters. All components are built with production-quality TypeScript/TSX, using **Mantine v7** for layout and interactive primitives, **motion** (`framer-motion`) for micro-animations and page transitions, and **SWR** for data-fetching with stale-while-revalidate caching.

The architecture centres on three structural contracts established in earlier phases:

- **Phase 1 Types:** Product, Category, Discount, and Order domain interfaces sourced from `packages/types`.
- **Phase 4 Catalog API:** REST endpoints at `NEXT_PUBLIC_API_URL` for products, categories, and flash sales — including query-string filtering, pagination, and slug-based lookup.
- **Phase 5 Design System:** Mantine theme tokens (Primary Pink `#FF6B8B`, Secondary Green `#4CAF7D`, Accent Purple `#A78BFA`, Cream BG `#FFF8F6`) and pre-composed animation variants (`fadeInUp`, `staggerContainer`, `cardHover`, `pageTransition`) sourced from `apps/web/src/lib/animations.ts`.

All storefront pages live under `apps/web/src/app/(storefront)/` using a shared route group layout that injects the Navbar, Footer, and `PageTransition` wrapper.

---

### Step 1: API Client & Data Fetching Hooks

Install the SWR data-fetching library:

```bash
pnpm --filter @my-oxygen/web add swr
```

#### `apps/web/src/lib/api-client.ts`

A typed fetch wrapper that reads `NEXT_PUBLIC_API_URL`, injects the stored JWT access token from `localStorage` (with a cookie fallback for SSR-compatible middleware), and surfaces structured `ApiError` objects for downstream error handling.

```typescript
// apps/web/src/lib/api-client.ts

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mo_access_token");
}

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const url = `${baseUrl}${path}`;

  const token = getAccessToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (!res.ok) {
    let code = "UNKNOWN_ERROR";
    let message = `Request failed with status ${res.status}`;
    try {
      const errBody = await res.json();
      code = errBody?.error?.code ?? code;
      message = errBody?.error?.message ?? message;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, code, message);
  }

  return res.json() as Promise<ApiResponse<T>>;
}

// Convenience methods
export const apiClient = {
  get: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { method: "GET", ...init }),

  post: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      ...init,
    }),

  patch: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
      ...init,
    }),

  delete: <T>(path: string, init?: RequestInit) =>
    request<T>(path, { method: "DELETE", ...init }),
};
```

#### `apps/web/src/hooks/useCatalog.ts`

Four SWR-powered hooks — `useProducts`, `useProduct`, `useFlashSales`, and `useCategories` — each returning `{ data, isLoading, isError }` tuples. Query string parameters are serialised via `URLSearchParams` so callers can pass a plain object.

```typescript
// apps/web/src/hooks/useCatalog.ts
import useSWR from "swr";
import { apiClient, ApiError } from "@/lib/api-client";

// ─── Domain Types (sourced from packages/types) ───────────────────────────────

export interface Category {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
}

export interface Product {
  id: string;
  title: string;
  slug: string;
  sku: string;
  description: string;
  basePrice: string;
  effectivePrice: string;
  isOnSale: boolean;
  saleEndsAt: string | null;
  images: string[];
  inStock: boolean;
  stockCount: number;
  category: Category;
}

export interface FlashSale {
  id: string;
  product: Product;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  value: string;
  endsAt: string;
}

export interface ProductQuery {
  categorySlug?: string;
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: "price_asc" | "price_desc" | "newest" | "popular";
  page?: number;
  limit?: number;
}

// ─── Generic SWR fetcher ──────────────────────────────────────────────────────

function buildFetcher<T>(path: string) {
  return () => apiClient.get<T>(path).then((r) => r.data);
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useProducts(query: ProductQuery = {}) {
  const params = new URLSearchParams();
  if (query.categorySlug) params.set("category", query.categorySlug);
  if (query.search) params.set("search", query.search);
  if (query.minPrice != null) params.set("minPrice", String(query.minPrice));
  if (query.maxPrice != null) params.set("maxPrice", String(query.maxPrice));
  if (query.inStock != null) params.set("inStock", String(query.inStock));
  if (query.sort) params.set("sort", query.sort);
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit ?? 12));

  const key = `/products?${params.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<Product[]>(
    key,
    buildFetcher<Product[]>(key),
    { keepPreviousData: true },
  );

  return {
    products: data ?? [],
    isLoading,
    isError: error instanceof ApiError ? error : null,
    mutate,
  };
}

export function useProduct(slug: string | null) {
  const key = slug ? `/products/${slug}` : null;

  const { data, error, isLoading } = useSWR<Product>(
    key,
    key ? buildFetcher<Product>(key) : null,
  );

  return {
    product: data ?? null,
    isLoading,
    isError: error instanceof ApiError ? error : null,
  };
}

export function useFlashSales() {
  const { data, error, isLoading } = useSWR<FlashSale[]>(
    "/discounts/flash-sales",
    buildFetcher<FlashSale[]>("/discounts/flash-sales"),
    { refreshInterval: 60_000 }, // re-fetch every minute
  );

  return {
    flashSales: data ?? [],
    isLoading,
    isError: error instanceof ApiError ? error : null,
  };
}

export function useCategories() {
  const { data, error, isLoading } = useSWR<Category[]>(
    "/categories",
    buildFetcher<Category[]>("/categories"),
    { revalidateOnFocus: false },
  );

  return {
    categories: data ?? [],
    isLoading,
    isError: error instanceof ApiError ? error : null,
  };
}
```

---

### Step 2: App Shell — Navbar & Footer

#### `apps/web/src/components/layout/Navbar.tsx`

A sticky responsive Navbar. On desktop it renders the full navigation strip; on mobile it collapses into a Mantine `Drawer`. `useWindowScroll` detects > 50 px scroll depth and applies a glassmorphism backdrop + shadow via a `motion.animate` transition so the transition is buttery-smooth rather than a hard CSS class toggle.

```tsx
// apps/web/src/components/layout/Navbar.tsx
"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import {
  Burger,
  Button,
  Drawer,
  Group,
  Stack,
  Text,
  ActionIcon,
  Badge,
  TextInput,
} from "@mantine/core";
import { useDisclosure, useWindowScroll } from "@mantine/hooks";
import { motion, useAnimation } from "motion/react";
import {
  IconHeart,
  IconShoppingCart,
  IconSearch,
  IconLeaf,
} from "@tabler/icons-react";

interface NavbarProps {
  cartCount?: number;
  wishlistCount?: number;
}

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Shop", href: "/shop" },
  { label: "Newborn", href: "/shop?category=newborn" },
  { label: "Mother Care", href: "/shop?category=mother-care" },
  { label: "Skin Care", href: "/shop?category=skin-care" },
  { label: "Inner Wear", href: "/shop?category=inner-wear" },
  { label: "About Us", href: "/about" },
] as const;

export function Navbar({ cartCount = 0, wishlistCount = 0 }: NavbarProps) {
  const [drawerOpened, { open: openDrawer, close: closeDrawer }] =
    useDisclosure(false);
  const [scroll] = useWindowScroll();
  const controls = useAnimation();
  const isScrolled = scroll.y > 50;

  useEffect(() => {
    controls.start(
      isScrolled
        ? {
            backgroundColor: "rgba(255, 248, 246, 0.85)",
            backdropFilter: "blur(12px)",
            boxShadow: "0 2px 20px rgba(255,107,139,0.12)",
          }
        : {
            backgroundColor: "rgba(255, 248, 246, 1)",
            backdropFilter: "blur(0px)",
            boxShadow: "none",
          },
    );
  }, [isScrolled, controls]);

  return (
    <>
      <motion.header
        animate={controls}
        initial={{
          backgroundColor: "rgba(255, 248, 246, 1)",
          backdropFilter: "blur(0px)",
          boxShadow: "none",
        }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 200,
          borderBottom: "1px solid rgba(255,107,139,0.1)",
        }}
      >
        <Group
          justify="space-between"
          px={{ base: "md", md: "xl" }}
          py="sm"
          style={{ maxWidth: 1280, margin: "0 auto" }}
        >
          {/* Logo */}
          <Link href="/" style={{ textDecoration: "none" }}>
            <Group gap={6}>
              <IconLeaf size={26} color="#FF6B8B" stroke={2} />
              <Text
                fw={800}
                size="lg"
                style={{
                  background:
                    "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  letterSpacing: "-0.5px",
                }}
              >
                My Oxygen
              </Text>
            </Group>
          </Link>

          {/* Desktop Nav Links */}
          <Group gap="xl" visibleFrom="md">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{ textDecoration: "none" }}
              >
                <Text
                  size="sm"
                  fw={500}
                  c="dark.4"
                  style={{
                    transition: "color 0.2s",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "#FF6B8B")
                  }
                  onMouseLeave={(e) => (e.currentTarget.style.color = "")}
                >
                  {link.label}
                </Text>
              </Link>
            ))}
          </Group>

          {/* Right Controls */}
          <Group gap="xs">
            {/* Search — desktop only */}
            <TextInput
              placeholder="Search products…"
              leftSection={<IconSearch size={14} color="#6B7280" />}
              radius="xl"
              size="xs"
              visibleFrom="md"
              styles={{
                input: {
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #E5E7EB",
                  width: 200,
                  "&:focus": { borderColor: "#FF6B8B" },
                },
              }}
            />

            {/* Wishlist */}
            <ActionIcon variant="subtle" size="lg" pos="relative">
              <IconHeart size={20} color="#FF6B8B" />
              {wishlistCount > 0 && (
                <Badge
                  size="xs"
                  color="pink"
                  style={{ position: "absolute", top: -4, right: -4 }}
                  circle
                >
                  {wishlistCount}
                </Badge>
              )}
            </ActionIcon>

            {/* Cart */}
            <Link href="/cart" style={{ textDecoration: "none" }}>
              <ActionIcon variant="subtle" size="lg" pos="relative">
                <IconShoppingCart size={20} color="#1F2937" />
                {cartCount > 0 && (
                  <Badge
                    size="xs"
                    color="pink"
                    style={{ position: "absolute", top: -4, right: -4 }}
                    circle
                  >
                    {cartCount}
                  </Badge>
                )}
              </ActionIcon>
            </Link>

            {/* Auth CTA */}
            <Button
              component={Link}
              href="/auth/login"
              size="xs"
              radius="xl"
              visibleFrom="sm"
              style={{
                background: "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
                border: "none",
              }}
            >
              Login / Signup
            </Button>

            {/* Mobile Burger */}
            <Burger
              opened={drawerOpened}
              onClick={openDrawer}
              hiddenFrom="md"
              size="sm"
              color="#FF6B8B"
            />
          </Group>
        </Group>
      </motion.header>

      {/* Mobile Drawer */}
      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        title={
          <Group gap={6}>
            <IconLeaf size={20} color="#FF6B8B" />
            <Text fw={800} c="pink.5">
              My Oxygen
            </Text>
          </Group>
        }
        padding="md"
        size="sm"
        position="left"
      >
        <Stack gap="lg" mt="md">
          <TextInput
            placeholder="Search products…"
            leftSection={<IconSearch size={14} />}
            radius="xl"
          />
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              style={{ textDecoration: "none" }}
              onClick={closeDrawer}
            >
              <Text size="md" fw={500} c="dark.4" py={4}>
                {link.label}
              </Text>
            </Link>
          ))}
          <Button
            component={Link}
            href="/auth/login"
            radius="xl"
            fullWidth
            style={{
              background: "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
              border: "none",
            }}
          >
            Login / Signup
          </Button>
        </Stack>
      </Drawer>
    </>
  );
}
```

#### `apps/web/src/components/layout/Footer.tsx`

A rich green-background footer with the brand logo, navigation clusters, social icons, and the 'Because You Deserve the Best' tagline.

```tsx
// apps/web/src/components/layout/Footer.tsx
import Link from "next/link";
import {
  Box,
  Container,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  ActionIcon,
} from "@mantine/core";
import {
  IconLeaf,
  IconBrandFacebook,
  IconBrandInstagram,
  IconBrandYoutube,
} from "@tabler/icons-react";

const FOOTER_LINKS = {
  Shop: [
    { label: "Newborn", href: "/shop?category=newborn" },
    { label: "Mother Care", href: "/shop?category=mother-care" },
    { label: "Skin Care", href: "/shop?category=skin-care" },
    { label: "Inner Wear", href: "/shop?category=inner-wear" },
  ],
  Company: [
    { label: "About Us", href: "/about" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "/contact" },
    { label: "Careers", href: "/careers" },
  ],
  Support: [
    { label: "FAQ", href: "/faq" },
    { label: "Return Policy", href: "/return-policy" },
    { label: "Shipping Info", href: "/shipping" },
    { label: "Track Order", href: "/track" },
  ],
};

export function Footer() {
  return (
    <Box
      component="footer"
      style={{ backgroundColor: "#4CAF7D", color: "#FFFFFF" }}
    >
      <Container size="xl" py={48}>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="xl">
          {/* Brand Column */}
          <Stack gap="md">
            <Group gap={6}>
              <IconLeaf size={28} color="#FFF8F6" stroke={2} />
              <Text
                fw={900}
                size="xl"
                c="white"
                style={{ letterSpacing: "-0.5px" }}
              >
                My Oxygen
              </Text>
            </Group>
            <Text size="sm" c="rgba(255,255,255,0.8)" lh={1.7}>
              Premium maternal & newborn health products, delivered across
              Bangladesh with care.
            </Text>
            <Text size="xs" fw={600} c="rgba(255,255,255,0.9)" fs="italic">
              "Because You Deserve the Best"
            </Text>
            <Group gap="xs" mt={4}>
              <ActionIcon variant="white" radius="xl" size="md" color="green.7">
                <IconBrandFacebook size={16} />
              </ActionIcon>
              <ActionIcon variant="white" radius="xl" size="md" color="green.7">
                <IconBrandInstagram size={16} />
              </ActionIcon>
              <ActionIcon variant="white" radius="xl" size="md" color="green.7">
                <IconBrandYoutube size={16} />
              </ActionIcon>
            </Group>
          </Stack>

          {/* Link Columns */}
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <Stack key={title} gap="sm">
              <Text fw={700} size="sm" c="white" tt="uppercase" tracking="wide">
                {title}
              </Text>
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{ textDecoration: "none" }}
                >
                  <Text
                    size="sm"
                    c="rgba(255,255,255,0.75)"
                    style={{ transition: "color 0.2s", cursor: "pointer" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.color = "#FFFFFF")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.color = "rgba(255,255,255,0.75)")
                    }
                  >
                    {link.label}
                  </Text>
                </Link>
              ))}
            </Stack>
          ))}
        </SimpleGrid>

        <Divider my="xl" color="rgba(255,255,255,0.2)" />

        <Group justify="space-between" wrap="wrap" gap="xs">
          <Text size="xs" c="rgba(255,255,255,0.7)">
            © {new Date().getFullYear()} My Oxygen. All rights reserved.
          </Text>
          <Group gap="md">
            <Text size="xs" c="rgba(255,255,255,0.7)">
              Healthy Life • Happy You
            </Text>
            <Text size="xs" c="rgba(255,255,255,0.7)">
              From Newborn to You
            </Text>
          </Group>
        </Group>
      </Container>
    </Box>
  );
}
```

---

### Step 3: Hero Section

#### `apps/web/src/components/home/HeroSection.tsx`

A full-width hero with a staggered headline reveal, pill-shaped 'Shop Now' CTA, and four trust-badge tiles that enter with a staggered `fadeInUp` via motion. Two large decorative blobs (radial-gradient `div`s) float with a gentle `motion.animate` looping animation for depth.

```tsx
// apps/web/src/components/home/HeroSection.tsx
"use client";

import { motion } from "motion/react";
import {
  Box,
  Button,
  Container,
  Grid,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconArrowRight,
  IconShieldCheck,
  IconLeaf,
  IconTruck,
  IconLock,
} from "@tabler/icons-react";
import Image from "next/image";
import Link from "next/link";

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const TRUST_BADGES = [
  { icon: IconShieldCheck, label: "Premium Quality", color: "#FF6B8B" },
  { icon: IconLeaf, label: "Safe & Natural", color: "#4CAF7D" },
  { icon: IconTruck, label: "Fast Delivery", color: "#A78BFA" },
  { icon: IconLock, label: "Secure Payment", color: "#F59E0B" },
] as const;

export function HeroSection() {
  return (
    <Box
      style={{
        backgroundColor: "#FFF8F6",
        overflow: "hidden",
        position: "relative",
        minHeight: 560,
      }}
    >
      {/* Decorative Blobs */}
      <motion.div
        animate={{ y: [0, -18, 0], x: [0, 10, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          top: -80,
          left: -80,
          width: 340,
          height: 340,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(255,107,139,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <motion.div
        animate={{ y: [0, 14, 0], x: [0, -8, 0] }}
        transition={{
          duration: 9,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        style={{
          position: "absolute",
          bottom: -60,
          right: -60,
          width: 280,
          height: 280,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(76,175,125,0.15) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <Container size="xl" py={{ base: 48, md: 80 }}>
        <Grid gutter={{ base: 40, md: 60 }} align="center">
          {/* Left: Copy */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
            >
              <Stack gap="lg">
                <motion.div variants={fadeInUp} transition={{ duration: 0.6 }}>
                  <Text
                    size="xs"
                    fw={600}
                    tt="uppercase"
                    c="#4CAF7D"
                    style={{ letterSpacing: 2 }}
                  >
                    Healthy Life • Happy You
                  </Text>
                </motion.div>

                <motion.div variants={fadeInUp} transition={{ duration: 0.6 }}>
                  <Text
                    component="h1"
                    size="3.2rem"
                    fw={900}
                    c="#1F2937"
                    lh={1.15}
                    style={{ letterSpacing: "-1px" }}
                  >
                    Your Health,{" "}
                    <Text
                      component="span"
                      inherit
                      style={{
                        background:
                          "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      Our Priority
                    </Text>
                  </Text>
                </motion.div>

                <motion.div variants={fadeInUp} transition={{ duration: 0.6 }}>
                  <Text size="md" c="#6B7280" maw={440} lh={1.7}>
                    Premium maternal and newborn health essentials — from gentle
                    skincare to comfortable inner wear. Trusted by mothers
                    across Bangladesh.
                  </Text>
                </motion.div>

                <motion.div variants={fadeInUp} transition={{ duration: 0.6 }}>
                  <Group gap="sm">
                    <Button
                      component={Link}
                      href="/shop"
                      size="lg"
                      radius="xl"
                      rightSection={<IconArrowRight size={18} />}
                      style={{
                        background:
                          "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
                        border: "none",
                        paddingLeft: 28,
                        paddingRight: 28,
                      }}
                    >
                      Shop Now
                    </Button>
                    <Button
                      component={Link}
                      href="/about"
                      size="lg"
                      radius="xl"
                      variant="outline"
                      color="pink"
                    >
                      Learn More
                    </Button>
                  </Group>
                </motion.div>
              </Stack>
            </motion.div>
          </Grid.Col>

          {/* Right: Hero Image */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              style={{
                position: "relative",
                borderRadius: 24,
                overflow: "hidden",
              }}
            >
              <Image
                src="/images/hero-mother-baby.webp"
                alt="Happy mother holding newborn baby"
                width={620}
                height={480}
                style={{
                  objectFit: "cover",
                  borderRadius: 24,
                  width: "100%",
                  height: "auto",
                }}
                priority
              />
            </motion.div>
          </Grid.Col>
        </Grid>

        {/* Trust Badges */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          style={{ marginTop: 48 }}
        >
          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            {TRUST_BADGES.map(({ icon: Icon, label, color }) => (
              <motion.div
                key={label}
                variants={fadeInUp}
                transition={{ duration: 0.5 }}
              >
                <Box
                  style={{
                    backgroundColor: "#FFFFFF",
                    border: `1.5px solid ${color}22`,
                    borderRadius: 16,
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                  }}
                >
                  <Box
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      backgroundColor: `${color}18`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} color={color} stroke={1.8} />
                  </Box>
                  <Text size="sm" fw={600} c="#1F2937">
                    {label}
                  </Text>
                </Box>
              </motion.div>
            ))}
          </SimpleGrid>
        </motion.div>
      </Container>
    </Box>
  );
}
```

---

### Step 4: Category Showcase Grid

#### `apps/web/src/components/home/CategorySection.tsx`

A 4-column responsive grid of category cards. Each card lifts and its icon rotates on hover via motion `whileHover`. Cards enter staggered on first mount via `staggerContainer`. Brand colors map to each category: Newborn → Pink, Mother Care → Green, Skin Care → Purple, Inner Wear → Pink gradient.

```tsx
// apps/web/src/components/home/CategorySection.tsx
"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Box, Container, SimpleGrid, Stack, Text } from "@mantine/core";
import {
  IconArrowRight,
  IconBaby,
  IconHeart,
  IconSparkles,
  IconShirt,
} from "@tabler/icons-react";

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const fadeInUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

interface CategoryCardData {
  slug: string;
  name: string;
  subtitle: string;
  href: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const CATEGORIES: CategoryCardData[] = [
  {
    slug: "newborn",
    name: "Newborn",
    subtitle: "Gentle care for tiny ones",
    href: "/shop?category=newborn",
    icon: IconBaby,
    color: "#FF6B8B",
    bgColor: "rgba(255,107,139,0.1)",
  },
  {
    slug: "mother-care",
    name: "Mother Care",
    subtitle: "Nurture the nurturer",
    href: "/shop?category=mother-care",
    icon: IconHeart,
    color: "#4CAF7D",
    bgColor: "rgba(76,175,125,0.1)",
  },
  {
    slug: "skin-care",
    name: "Skin Care",
    subtitle: "Natural & dermatologist-tested",
    href: "/shop?category=skin-care",
    icon: IconSparkles,
    color: "#A78BFA",
    bgColor: "rgba(167,139,250,0.1)",
  },
  {
    slug: "inner-wear",
    name: "Inner Wear",
    subtitle: "Comfort made for you",
    href: "/shop?category=inner-wear",
    icon: IconShirt,
    color: "#F472B6",
    bgColor: "rgba(244,114,182,0.1)",
  },
];

function CategoryCard({ category }: { category: CategoryCardData }) {
  const Icon = category.icon;

  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -8, transition: { duration: 0.25 } }}
      style={{ height: "100%" }}
    >
      <Link href={category.href} style={{ textDecoration: "none" }}>
        <Box
          style={{
            backgroundColor: "#FFFFFF",
            border: `1.5px solid ${category.color}22`,
            borderRadius: 20,
            padding: "28px 24px",
            textAlign: "center",
            height: "100%",
            cursor: "pointer",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            transition: "box-shadow 0.25s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.boxShadow =
              `0 12px 32px ${category.color}30`;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.boxShadow =
              "0 4px 16px rgba(0,0,0,0.06)";
          }}
        >
          <Stack gap="sm" align="center">
            {/* Circular Icon */}
            <motion.div
              whileHover={{ rotate: 12 }}
              transition={{ type: "spring", stiffness: 300 }}
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                backgroundColor: category.bgColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon size={32} color={category.color} stroke={1.6} />
            </motion.div>

            <Text fw={700} size="md" c="#1F2937">
              {category.name}
            </Text>
            <Text size="xs" c="#6B7280" lh={1.5}>
              {category.subtitle}
            </Text>

            <motion.div
              whileHover={{ x: 4 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <Text
                size="sm"
                fw={600}
                style={{
                  color: category.color,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                Explore <IconArrowRight size={14} />
              </Text>
            </motion.div>
          </Stack>
        </Box>
      </Link>
    </motion.div>
  );
}

export function CategorySection() {
  return (
    <Box py={{ base: 48, md: 72 }} style={{ backgroundColor: "#FFF8F6" }}>
      <Container size="xl">
        <Stack gap="xs" align="center" mb={40}>
          <Text
            size="xs"
            fw={600}
            tt="uppercase"
            c="#4CAF7D"
            style={{ letterSpacing: 2 }}
          >
            Browse by Category
          </Text>
          <Text
            component="h2"
            size="2rem"
            fw={800}
            c="#1F2937"
            ta="center"
            style={{ letterSpacing: "-0.5px" }}
          >
            Shop Your Needs
          </Text>
        </Stack>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
        >
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="xl">
            {CATEGORIES.map((cat) => (
              <CategoryCard key={cat.slug} category={cat} />
            ))}
          </SimpleGrid>
        </motion.div>
      </Container>
    </Box>
  );
}
```

---

### Step 5: Featured Products Section

#### `apps/web/src/components/home/FeaturedProducts.tsx`

A Mantine `Tabs` bar switches between category tabs. The active underline indicator is a shared `motion.div` with `layoutId="activeTabIndicator"` so it slides smoothly between tabs. Each tab swap refetches products for that category using `useProducts`. During loading, 4× `ProductCardSkeleton` instances fill the grid, then dissolve into real `ProductCard` tiles via AnimatePresence.

```tsx
// apps/web/src/components/home/FeaturedProducts.tsx
"use client";

import React, { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { Box, Container, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import Link from "next/link";
import { useProducts } from "@/hooks/useCatalog";

// Import from Phase 5 component library
// import { ProductCard, ProductCardSkeleton } from "@/components/product/ProductCard";

// ─── Placeholder stubs (replace with Phase 5 imports) ────────────────────────
function ProductCard({
  product,
}: {
  product: { id: string; title: string; effectivePrice: string };
}) {
  return (
    <Box
      p="md"
      style={{
        border: "1px solid #F3F4F6",
        borderRadius: 16,
        backgroundColor: "#FFFFFF",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}
    >
      <Text fw={600} size="sm" c="#1F2937" lineClamp={2}>
        {product.title}
      </Text>
      <Text mt={4} fw={700} c="#FF6B8B">
        ৳{product.effectivePrice}
      </Text>
    </Box>
  );
}

function ProductCardSkeleton() {
  return (
    <Box
      style={{
        border: "1px solid #F3F4F6",
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
      }}
    >
      <Box
        style={{
          height: 200,
          background:
            "linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.6s infinite",
        }}
      />
      <Box p="md">
        <Box
          style={{
            height: 14,
            borderRadius: 6,
            backgroundColor: "#F3F4F6",
            marginBottom: 8,
          }}
        />
        <Box
          style={{
            height: 14,
            borderRadius: 6,
            backgroundColor: "#F3F4F6",
            width: "60%",
          }}
        />
      </Box>
    </Box>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { value: "newborn", label: "Newborn" },
  { value: "mother-care", label: "Mother Care" },
  { value: "skin-care", label: "Skin Care" },
  { value: "inner-wear", label: "Inner Wear" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

export function FeaturedProducts() {
  const [activeTab, setActiveTab] = useState<TabValue>("newborn");
  const { products, isLoading } = useProducts({
    categorySlug: activeTab,
    limit: 4,
  });

  return (
    <Box py={{ base: 48, md: 72 }} style={{ backgroundColor: "#FFFFFF" }}>
      <Container size="xl">
        <Group
          justify="space-between"
          align="flex-end"
          mb={32}
          wrap="wrap"
          gap="sm"
        >
          <Stack gap={4}>
            <Text
              size="xs"
              fw={600}
              tt="uppercase"
              c="#4CAF7D"
              style={{ letterSpacing: 2 }}
            >
              Handpicked for You
            </Text>
            <Text
              component="h2"
              size="2rem"
              fw={800}
              c="#1F2937"
              style={{ letterSpacing: "-0.5px" }}
            >
              Featured Products
            </Text>
          </Stack>
          <Link
            href={`/shop?category=${activeTab}`}
            style={{ textDecoration: "none" }}
          >
            <Text size="sm" fw={600} c="#FF6B8B">
              View All →
            </Text>
          </Link>
        </Group>

        {/* Tab Bar */}
        <LayoutGroup>
          <Group gap={0} mb={32} style={{ borderBottom: "2px solid #F3F4F6" }}>
            {TABS.map((tab) => (
              <Box
                key={tab.value}
                component="button"
                onClick={() => setActiveTab(tab.value)}
                style={{
                  position: "relative",
                  padding: "10px 20px",
                  border: "none",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                  fontWeight: activeTab === tab.value ? 700 : 500,
                  color: activeTab === tab.value ? "#FF6B8B" : "#6B7280",
                  fontSize: 14,
                  transition: "color 0.2s",
                }}
              >
                {tab.label}
                {activeTab === tab.value && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    style={{
                      position: "absolute",
                      bottom: -2,
                      left: 0,
                      right: 0,
                      height: 3,
                      borderRadius: 2,
                      backgroundColor: "#FF6B8B",
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </Box>
            ))}
          </Group>
        </LayoutGroup>

        {/* Product Grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))
                : products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
            </SimpleGrid>
          </motion.div>
        </AnimatePresence>
      </Container>
    </Box>
  );
}
```

---

### Step 6: Flash Sale Banner Section

#### `apps/web/src/components/home/FlashSaleBanner.tsx`

A full-width pink-to-red gradient promotional banner with a live HH:MM:SS countdown. Each digit block pulses with a motion scale animation when the digit value changes, driven by `AnimatePresence` keyed on the digit string.

```tsx
// apps/web/src/components/home/FlashSaleBanner.tsx
"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Box, Button, Container, Group, Stack, Text } from "@mantine/core";
import { useInterval } from "@mantine/hooks";
import { IconArrowRight, IconFlame } from "@tabler/icons-react";
import Link from "next/link";

function getRemainingTime(endsAt: Date): { h: string; m: string; s: string } {
  const diff = Math.max(0, endsAt.getTime() - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return { h, m, s };
}

function DigitBlock({ value, label }: { value: string; label: string }) {
  return (
    <Stack gap={4} align="center">
      <Box
        style={{
          width: 64,
          height: 64,
          backgroundColor: "rgba(255,255,255,0.2)",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <AnimatePresence mode="popLayout">
          <motion.span
            key={value}
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            style={{
              position: "absolute",
              fontSize: 28,
              fontWeight: 900,
              color: "#FFFFFF",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </Box>
      <Text
        size="9px"
        fw={600}
        c="rgba(255,255,255,0.8)"
        tt="uppercase"
        style={{ letterSpacing: 1 }}
      >
        {label}
      </Text>
    </Stack>
  );
}

interface FlashSaleBannerProps {
  endsAt?: Date;
}

export function FlashSaleBanner({
  endsAt = new Date(Date.now() + 4 * 60 * 60 * 1000), // default: 4 hours from now
}: FlashSaleBannerProps) {
  const [time, setTime] = useState(() => getRemainingTime(endsAt));

  useInterval(() => {
    setTime(getRemainingTime(endsAt));
  }, 1000);

  return (
    <Box
      style={{
        background: "linear-gradient(135deg, #FF6B8B 0%, #EF4444 100%)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Decorative background shapes */}
      <Box
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 200,
          height: 200,
          borderRadius: "50%",
          backgroundColor: "rgba(255,255,255,0.06)",
          pointerEvents: "none",
        }}
      />
      <Box
        style={{
          position: "absolute",
          bottom: -30,
          left: "30%",
          width: 140,
          height: 140,
          borderRadius: "50%",
          backgroundColor: "rgba(255,255,255,0.05)",
          pointerEvents: "none",
        }}
      />

      <Container size="xl" py={{ base: 40, md: 56 }}>
        <Group justify="space-between" align="center" wrap="wrap" gap="xl">
          {/* Left: Text */}
          <Stack gap="xs" style={{ flex: 1 }}>
            <Group gap={8}>
              <IconFlame size={22} color="#FFF8F6" />
              <Text
                size="xs"
                fw={700}
                c="rgba(255,255,255,0.9)"
                tt="uppercase"
                style={{ letterSpacing: 2 }}
              >
                Flash Sale
              </Text>
            </Group>
            <Text
              component="h2"
              size="1.8rem"
              fw={900}
              c="#FFFFFF"
              lh={1.2}
              style={{ letterSpacing: "-0.5px" }}
            >
              Special Care for
              <br />
              Your Little One
            </Text>
            <Text size="sm" c="rgba(255,255,255,0.85)">
              Limited-time deals on our best-selling newborn products.
            </Text>
            <Button
              component={Link}
              href="/shop?category=newborn&sale=true"
              size="md"
              radius="xl"
              rightSection={<IconArrowRight size={16} />}
              mt={4}
              style={{
                backgroundColor: "#FFFFFF",
                color: "#FF6B8B",
                fontWeight: 700,
                border: "none",
                width: "fit-content",
              }}
            >
              Shop Newborn
            </Button>
          </Stack>

          {/* Right: Countdown */}
          <Stack gap="xs" align="center">
            <Text
              size="xs"
              fw={600}
              c="rgba(255,255,255,0.8)"
              tt="uppercase"
              style={{ letterSpacing: 1 }}
            >
              Ends in
            </Text>
            <Group gap="xs" align="flex-start">
              <DigitBlock value={time.h} label="Hours" />
              <Text size="2rem" fw={900} c="#FFFFFF" mt={10}>
                :
              </Text>
              <DigitBlock value={time.m} label="Mins" />
              <Text size="2rem" fw={900} c="#FFFFFF" mt={10}>
                :
              </Text>
              <DigitBlock value={time.s} label="Secs" />
            </Group>
          </Stack>
        </Group>
      </Container>
    </Box>
  );
}
```

---

### Step 7: Product Listing Page

#### `apps/web/src/app/(storefront)/shop/page.tsx`

A full shop listing page with URL-synced filters. `useSearchParams` reads the current URL query string on mount, `router.replace` writes filter changes back without a history push (so the back button still works). The left sidebar contains a Mantine `CheckboxGroup` for category filter, a `RangeSlider` with a pink thumb for price range, an in-stock toggle, and a sort `Select`. The product grid renders 6× `ProductCardSkeleton` during loading transitions and shows a centred empty-state illustration when no results match.

```tsx
// apps/web/src/app/(storefront)/shop/page.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Button,
  Checkbox,
  Container,
  Grid,
  Group,
  Pagination,
  RangeSlider,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { motion, AnimatePresence } from "motion/react";
import { IconSearch, IconShoppingBag } from "@tabler/icons-react";
import { useProducts } from "@/hooks/useCatalog";

// ─── Skeleton (replace with Phase 5 import) ──────────────────────────────────
function ProductCardSkeleton() {
  return (
    <Box
      style={{
        border: "1px solid #F3F4F6",
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
      }}
    >
      <Box
        style={{
          height: 200,
          background:
            "linear-gradient(90deg, #F3F4F6 25%, #E5E7EB 50%, #F3F4F6 75%)",
          backgroundSize: "200% 100%",
          animation: "shimmer 1.6s infinite",
        }}
      />
      <Box p="md">
        <Box
          style={{
            height: 12,
            borderRadius: 6,
            backgroundColor: "#F3F4F6",
            marginBottom: 8,
          }}
        />
        <Box
          style={{
            height: 12,
            borderRadius: 6,
            backgroundColor: "#F3F4F6",
            width: "55%",
          }}
        />
      </Box>
    </Box>
  );
}

function ProductCard({
  product,
}: {
  product: {
    id: string;
    slug: string;
    title: string;
    effectivePrice: string;
    images: string[];
  };
}) {
  return (
    <Box
      style={{
        border: "1px solid #F3F4F6",
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        cursor: "pointer",
        transition: "box-shadow 0.2s",
      }}
    >
      <Box
        style={{
          height: 200,
          backgroundColor: "#F9FAFB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {product.images[0] ? (
          <img
            src={product.images[0]}
            alt={product.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <IconShoppingBag size={48} color="#D1D5DB" />
        )}
      </Box>
      <Box p="md">
        <Text fw={600} size="sm" c="#1F2937" lineClamp={2}>
          {product.title}
        </Text>
        <Text mt={6} fw={700} size="md" c="#FF6B8B">
          ৳{product.effectivePrice}
        </Text>
      </Box>
    </Box>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: "newborn", label: "Newborn" },
  { value: "mother-care", label: "Mother Care" },
  { value: "skin-care", label: "Skin Care" },
  { value: "inner-wear", label: "Inner Wear" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "popular", label: "Most Popular" },
];

const PAGE_SIZE = 12;

export default function ShopPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── Read initial state from URL ──────────────────────────────────────────
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.getAll("category"),
  );
  const [priceRange, setPriceRange] = useState<[number, number]>([
    Number(searchParams.get("minPrice") ?? 0),
    Number(searchParams.get("maxPrice") ?? 5000),
  ]);
  const [inStockOnly, setInStockOnly] = useState(
    searchParams.get("inStock") === "true",
  );
  const [sort, setSort] = useState<string>(
    searchParams.get("sort") ?? "newest",
  );
  const [page, setPage] = useState(Number(searchParams.get("page") ?? 1));

  const [debouncedSearch] = useDebouncedValue(search, 350);

  // ─── Sync filters → URL (router.replace keeps single history entry) ───────
  const syncUrl = useCallback(
    (
      overrides: Record<string, string | string[] | number | boolean | null>,
    ) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(overrides).forEach(([k, v]) => {
        params.delete(k);
        if (v === null || v === "" || v === false) return;
        if (Array.isArray(v)) v.forEach((item) => params.append(k, item));
        else params.set(k, String(v));
      });
      router.replace(`/shop?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    syncUrl({
      search: debouncedSearch || null,
      category: selectedCategories,
      minPrice: priceRange[0] > 0 ? priceRange[0] : null,
      maxPrice: priceRange[1] < 5000 ? priceRange[1] : null,
      inStock: inStockOnly || null,
      sort: sort !== "newest" ? sort : null,
      page: page > 1 ? page : null,
    });
  }, [
    debouncedSearch,
    selectedCategories,
    priceRange,
    inStockOnly,
    sort,
    page,
  ]);

  // ─── Data fetch ───────────────────────────────────────────────────────────
  const { products, isLoading } = useProducts({
    search: debouncedSearch || undefined,
    categorySlug: selectedCategories[0],
    minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
    maxPrice: priceRange[1] < 5000 ? priceRange[1] : undefined,
    inStock: inStockOnly || undefined,
    sort: sort as "newest" | "price_asc" | "price_desc" | "popular",
    page,
    limit: PAGE_SIZE,
  });

  const totalPages = Math.max(1, Math.ceil(100 / PAGE_SIZE)); // Replace 100 with real meta.total

  function clearFilters() {
    setSearch("");
    setSelectedCategories([]);
    setPriceRange([0, 5000]);
    setInStockOnly(false);
    setSort("newest");
    setPage(1);
  }

  return (
    <Box
      style={{ backgroundColor: "#FFF8F6", minHeight: "100vh" }}
      py={{ base: 24, md: 40 }}
    >
      {/* Shimmer keyframes */}
      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>

      <Container size="xl">
        <Title order={1} mb={8} c="#1F2937" style={{ letterSpacing: "-0.5px" }}>
          Shop All Products
        </Title>
        <Text c="#6B7280" mb={32}>
          Discover our full range of maternal & newborn essentials.
        </Text>

        <Grid gutter="xl">
          {/* ── Sidebar Filters ──────────────────────────────────────────────── */}
          <Grid.Col span={{ base: 12, md: 3 }}>
            <Box
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #F3F4F6",
                borderRadius: 20,
                padding: 24,
                position: "sticky",
                top: 80,
              }}
            >
              <Stack gap="xl">
                <Box>
                  <Text fw={700} size="sm" c="#1F2937" mb={12}>
                    Category
                  </Text>
                  <Checkbox.Group
                    value={selectedCategories}
                    onChange={(v) => {
                      setSelectedCategories(v);
                      setPage(1);
                    }}
                  >
                    <Stack gap="sm">
                      {CATEGORY_OPTIONS.map((opt) => (
                        <Checkbox
                          key={opt.value}
                          value={opt.value}
                          label={opt.label}
                          color="pink"
                          radius="sm"
                        />
                      ))}
                    </Stack>
                  </Checkbox.Group>
                </Box>

                <Box>
                  <Text fw={700} size="sm" c="#1F2937" mb={8}>
                    Price Range
                  </Text>
                  <Text size="xs" c="#6B7280" mb={12}>
                    ৳{priceRange[0]} — ৳{priceRange[1]}
                  </Text>
                  <RangeSlider
                    min={0}
                    max={5000}
                    step={50}
                    value={priceRange}
                    onChange={setPriceRange}
                    onChangeEnd={() => setPage(1)}
                    color="pink"
                    styles={{
                      thumb: {
                        borderColor: "#FF6B8B",
                        backgroundColor: "#FF6B8B",
                      },
                      bar: { backgroundColor: "#FF6B8B" },
                    }}
                  />
                </Box>

                <Box>
                  <Switch
                    checked={inStockOnly}
                    onChange={(e) => {
                      setInStockOnly(e.currentTarget.checked);
                      setPage(1);
                    }}
                    label="In Stock Only"
                    color="pink"
                  />
                </Box>

                <Button
                  variant="subtle"
                  color="gray"
                  size="xs"
                  onClick={clearFilters}
                  fullWidth
                >
                  Clear All Filters
                </Button>
              </Stack>
            </Box>
          </Grid.Col>

          {/* ── Product Grid ──────────────────────────────────────────────────── */}
          <Grid.Col span={{ base: 12, md: 9 }}>
            <Group justify="space-between" mb="md" wrap="wrap" gap="sm">
              <TextInput
                value={search}
                onChange={(e) => {
                  setSearch(e.currentTarget.value);
                  setPage(1);
                }}
                placeholder="Search products…"
                leftSection={<IconSearch size={14} />}
                radius="xl"
                style={{ flex: 1, maxWidth: 320 }}
                styles={{
                  input: {
                    borderColor: "#E5E7EB",
                    "&:focus": { borderColor: "#FF6B8B" },
                  },
                }}
              />
              <Select
                data={SORT_OPTIONS}
                value={sort}
                onChange={(v) => {
                  setSort(v ?? "newest");
                  setPage(1);
                }}
                radius="xl"
                size="sm"
                style={{ width: 180 }}
              />
            </Group>

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div
                  key="skeletons"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <ProductCardSkeleton key={i} />
                    ))}
                  </SimpleGrid>
                </motion.div>
              ) : products.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Box
                    style={{
                      textAlign: "center",
                      padding: "80px 24px",
                      backgroundColor: "#FFFFFF",
                      borderRadius: 20,
                      border: "1px dashed #E5E7EB",
                    }}
                  >
                    <IconShoppingBag size={56} color="#D1D5DB" />
                    <Text fw={700} size="lg" c="#1F2937" mt={16}>
                      No products found
                    </Text>
                    <Text c="#6B7280" mt={8}>
                      Try adjusting your filters or search term.
                    </Text>
                    <Button
                      onClick={clearFilters}
                      mt={20}
                      radius="xl"
                      variant="outline"
                      color="pink"
                    >
                      Clear Filters
                    </Button>
                  </Box>
                </motion.div>
              ) : (
                <motion.div
                  key={`products-${page}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                    {products.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </SimpleGrid>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pagination */}
            {!isLoading && products.length > 0 && (
              <Group justify="center" mt={40}>
                <Pagination
                  total={totalPages}
                  value={page}
                  onChange={setPage}
                  color="pink"
                  radius="xl"
                />
              </Group>
            )}
          </Grid.Col>
        </Grid>
      </Container>
    </Box>
  );
}
```

---

### Step 8: Single Product Page

#### `apps/web/src/app/(storefront)/products/[slug]/page.tsx`

A fully-featured PDP (Product Detail Page). The image gallery uses a main image pane and a horizontal thumbnail strip — clicking a thumbnail swaps the main image with a motion crossfade via `AnimatePresence`. The price row shows a struck-through base price when a flash sale is active, alongside a pink effective price. A flash sale countdown renders inline. Related products scroll horizontally via Mantine `ScrollArea`. The breadcrumb is composed with Mantine `Breadcrumbs`.

```tsx
// apps/web/src/app/(storefront)/products/[slug]/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Container,
  Divider,
  Grid,
  Group,
  ScrollArea,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { useInterval } from "@mantine/hooks";
import { motion, AnimatePresence } from "motion/react";
import {
  IconHeart,
  IconMinus,
  IconPlus,
  IconShoppingCart,
  IconStar,
} from "@tabler/icons-react";
import Link from "next/link";
import { useProduct, useProducts } from "@/hooks/useCatalog";

// ─── Countdown helper ─────────────────────────────────────────────────────────
function useCountdown(endsAt: string | null) {
  const [remaining, setRemaining] = useState("");
  useInterval(() => {
    if (!endsAt) return;
    const diff = Math.max(0, new Date(endsAt).getTime() - Date.now());
    const s = Math.floor(diff / 1000);
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    setRemaining(`${h}:${m}:${sec}`);
  }, 1000);
  return remaining;
}
// ─────────────────────────────────────────────────────────────────────────────

// ─── Related Product Card stub ────────────────────────────────────────────────
function RelatedProductCard({
  product,
}: {
  product: {
    id: string;
    slug: string;
    title: string;
    effectivePrice: string;
    images: string[];
  };
}) {
  return (
    <Link href={`/products/${product.slug}`} style={{ textDecoration: "none" }}>
      <Box
        style={{
          width: 180,
          flexShrink: 0,
          backgroundColor: "#FFFFFF",
          border: "1px solid #F3F4F6",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          cursor: "pointer",
        }}
      >
        <Box style={{ height: 140, backgroundColor: "#F9FAFB" }}>
          {product.images[0] && (
            <img
              src={product.images[0]}
              alt={product.title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          )}
        </Box>
        <Box p="xs">
          <Text size="xs" fw={600} c="#1F2937" lineClamp={2}>
            {product.title}
          </Text>
          <Text size="sm" fw={700} c="#FF6B8B" mt={4}>
            ৳{product.effectivePrice}
          </Text>
        </Box>
      </Box>
    </Link>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const { product, isLoading } = useProduct(params.slug ?? null);
  const { products: related } = useProducts({
    categorySlug: product?.category?.slug,
    limit: 8,
  });
  const countdown = useCountdown(product?.saleEndsAt ?? null);

  const [selectedImage, setSelectedImage] = useState<string>("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (product?.images?.[0]) setSelectedImage(product.images[0]);
  }, [product]);

  if (isLoading) {
    return (
      <Container size="xl" py={48}>
        <Text c="#6B7280">Loading product…</Text>
      </Container>
    );
  }

  if (!product) {
    return (
      <Container size="xl" py={48}>
        <Text c="#EF4444" fw={600}>
          Product not found.
        </Text>
      </Container>
    );
  }

  return (
    <Box style={{ backgroundColor: "#FFF8F6", minHeight: "100vh" }}>
      <Container size="xl" py={{ base: 24, md: 48 }}>
        {/* Breadcrumb */}
        <Breadcrumbs mb={24} separator="›">
          <Link href="/" style={{ textDecoration: "none" }}>
            <Text size="sm" c="#6B7280">
              Home
            </Text>
          </Link>
          <Link
            href={`/shop?category=${product.category.slug}`}
            style={{ textDecoration: "none" }}
          >
            <Text size="sm" c="#6B7280">
              {product.category.name}
            </Text>
          </Link>
          <Text size="sm" c="#1F2937" fw={500}>
            {product.title}
          </Text>
        </Breadcrumbs>

        <Grid gutter={{ base: 24, md: 56 }}>
          {/* ── Image Gallery ─────────────────────────────────────────────── */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="md">
              {/* Main Image */}
              <Box
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #F3F4F6",
                  aspectRatio: "1 / 1",
                  position: "relative",
                }}
              >
                <AnimatePresence mode="crossfade">
                  <motion.img
                    key={selectedImage}
                    src={selectedImage}
                    alt={product.title}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      padding: 16,
                    }}
                  />
                </AnimatePresence>
              </Box>

              {/* Thumbnail Strip */}
              {product.images.length > 1 && (
                <Group gap="sm" wrap="nowrap" style={{ overflowX: "auto" }}>
                  {product.images.map((img, idx) => (
                    <Box
                      key={idx}
                      component="button"
                      onClick={() => setSelectedImage(img)}
                      style={{
                        width: 72,
                        height: 72,
                        flexShrink: 0,
                        borderRadius: 12,
                        overflow: "hidden",
                        border:
                          selectedImage === img
                            ? "2px solid #FF6B8B"
                            : "2px solid #F3F4F6",
                        cursor: "pointer",
                        padding: 0,
                        backgroundColor: "#FFFFFF",
                        transition: "border-color 0.2s",
                      }}
                    >
                      <img
                        src={img}
                        alt={`View ${idx + 1}`}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    </Box>
                  ))}
                </Group>
              )}
            </Stack>
          </Grid.Col>

          {/* ── Product Info ──────────────────────────────────────────────── */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="md">
              {/* Category Badge */}
              <Badge
                color="pink"
                variant="light"
                radius="xl"
                size="sm"
                component={Link}
                href={`/shop?category=${product.category.slug}`}
                style={{ cursor: "pointer", width: "fit-content" }}
              >
                {product.category.name}
              </Badge>

              <Text
                component="h1"
                size="1.8rem"
                fw={800}
                c="#1F2937"
                lh={1.2}
                style={{ letterSpacing: "-0.5px" }}
              >
                {product.title}
              </Text>

              {/* Star placeholder */}
              <Group gap={4}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <IconStar key={i} size={14} color="#F59E0B" fill="#F59E0B" />
                ))}
                <Text size="xs" c="#6B7280">
                  (24 reviews)
                </Text>
              </Group>

              {/* Price */}
              <Group gap="sm" align="flex-end">
                <Text fw={900} size="2rem" c="#FF6B8B">
                  ৳{product.effectivePrice}
                </Text>
                {product.isOnSale && (
                  <Text fw={500} size="md" c="#9CA3AF" td="line-through">
                    ৳{product.basePrice}
                  </Text>
                )}
                {product.isOnSale && (
                  <Badge color="red" variant="filled" radius="xl" size="sm">
                    SALE
                  </Badge>
                )}
              </Group>

              {/* Flash Sale Countdown */}
              {product.isOnSale && product.saleEndsAt && countdown && (
                <Box
                  style={{
                    backgroundColor: "rgba(255,107,139,0.08)",
                    border: "1px solid rgba(255,107,139,0.2)",
                    borderRadius: 12,
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Text size="xs" fw={600} c="#FF6B8B">
                    ⚡ Sale ends in:
                  </Text>
                  <Text
                    size="sm"
                    fw={900}
                    c="#EF4444"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {countdown}
                  </Text>
                </Box>
              )}

              {/* Stock Badge */}
              <Group gap="xs">
                <Badge
                  color={product.inStock ? "green" : "red"}
                  variant="dot"
                  size="md"
                >
                  {product.inStock
                    ? `In Stock (${product.stockCount} available)`
                    : "Out of Stock"}
                </Badge>
              </Group>

              <Divider />

              {/* Quantity Selector */}
              <Group gap="xs">
                <Text size="sm" fw={600} c="#1F2937">
                  Quantity:
                </Text>
                <Group
                  gap={0}
                  style={{
                    border: "1.5px solid #E5E7EB",
                    borderRadius: 12,
                    overflow: "hidden",
                  }}
                >
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    radius={0}
                  >
                    <IconMinus size={14} />
                  </ActionIcon>
                  <Box
                    style={{
                      width: 44,
                      textAlign: "center",
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#1F2937",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {quantity}
                  </Box>
                  <ActionIcon
                    variant="subtle"
                    size="lg"
                    onClick={() =>
                      setQuantity((q) => Math.min(product.stockCount, q + 1))
                    }
                    radius={0}
                    disabled={!product.inStock}
                  >
                    <IconPlus size={14} />
                  </ActionIcon>
                </Group>
              </Group>

              {/* CTA Buttons */}
              <Group gap="sm">
                <Button
                  size="lg"
                  radius="xl"
                  leftSection={<IconShoppingCart size={18} />}
                  disabled={!product.inStock}
                  style={{
                    background:
                      "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
                    border: "none",
                    flex: 1,
                  }}
                >
                  Add to Cart
                </Button>
                <ActionIcon
                  size={50}
                  radius="xl"
                  variant="outline"
                  color="pink"
                >
                  <IconHeart size={20} />
                </ActionIcon>
              </Group>
            </Stack>
          </Grid.Col>
        </Grid>

        {/* Description / Reviews Tabs */}
        <Box mt={56}>
          <Tabs defaultValue="description" color="pink">
            <Tabs.List style={{ borderBottom: "2px solid #F3F4F6" }}>
              <Tabs.Tab value="description" fw={600}>
                Description
              </Tabs.Tab>
              <Tabs.Tab value="reviews" fw={600}>
                Reviews (24)
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="description" pt={24}>
              <Text c="#6B7280" lh={1.8} style={{ maxWidth: 720 }}>
                {product.description}
              </Text>
            </Tabs.Panel>

            <Tabs.Panel value="reviews" pt={24}>
              <Text c="#6B7280">
                Customer reviews will be displayed here. (Phase 7)
              </Text>
            </Tabs.Panel>
          </Tabs>
        </Box>

        {/* Related Products */}
        {related.length > 0 && (
          <Box mt={56}>
            <Text
              fw={800}
              size="xl"
              c="#1F2937"
              mb={20}
              style={{ letterSpacing: "-0.3px" }}
            >
              You May Also Like
            </Text>
            <ScrollArea scrollbarSize={4} type="hover">
              <Group gap="md" wrap="nowrap" pb={8}>
                {related
                  .filter((p) => p.id !== product.id)
                  .map((p) => (
                    <RelatedProductCard key={p.id} product={p} />
                  ))}
              </Group>
            </ScrollArea>
          </Box>
        )}
      </Container>
    </Box>
  );
}
```

---

### Step 9: Page Transition Wrapper

#### `apps/web/src/components/layout/PageTransition.tsx`

A thin client wrapper that uses motion `AnimatePresence` to produce a smooth fade-slide transition between any two `(storefront)` route pages. The `pageTransition` variant is imported from the Phase 5 `animations.ts` library. Wrap the `(storefront)` route group layout's `{children}` with this component.

```tsx
// apps/web/src/components/layout/PageTransition.tsx
"use client";

import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname } from "next/navigation";

// Phase 5 animation variant — import from your animations library
const pageTransition = {
  hidden: { opacity: 0, y: 16 },
  enter: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.38, ease: [0.4, 0, 0.2, 1] },
  },
  exit: { opacity: 0, y: -10, transition: { duration: 0.22, ease: "easeIn" } },
};

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        variants={pageTransition}
        initial="hidden"
        animate="enter"
        exit="exit"
        style={{ flex: 1 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

**Usage — `apps/web/src/app/(storefront)/layout.tsx`:**

```tsx
// apps/web/src/app/(storefront)/layout.tsx
import React from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageTransition } from "@/components/layout/PageTransition";

export default function StorefrontLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
    >
      <Navbar />
      <PageTransition>
        <main style={{ flex: 1 }}>{children}</main>
      </PageTransition>
      <Footer />
    </div>
  );
}
```

---

### Step 10: Phase 6 Verification Checklist

Execute the following checks sequentially before initiating Phase 7:

1. **Dev Server Boot:**

```bash
pnpm --filter @my-oxygen/web dev
```

_Expected outcome:_ Next.js starts on `http://localhost:3000` with no TypeScript compilation errors or missing module warnings.

2. **Homepage Section Render:**

Open `http://localhost:3000`. Verify in order:

- `HeroSection` renders with gradient blobs animating on float loop.
- Four trust badges enter with staggered `fadeInUp` on first load.
- `CategorySection` four cards appear with stagger and lift on hover.
- `FeaturedProducts` tab bar renders; initial tab is `Newborn`; skeleton cards show while SWR fetches, then dissolve into real product tiles.
- `FlashSaleBanner` countdown ticks every second; digit blocks animate on change.

3. **Navbar Scroll Behaviour:**

Scroll past 50 px — verify that the header acquires a frosted-glass backdrop (`blur(12px)`) and a soft pink drop shadow via the `motion.animate` transition.

4. **Mobile Responsive Check:**

At viewport width ≤ 768 px:

- Navbar collapses to hamburger; Drawer opens with full navigation list on click.
- `CategorySection` renders in 2-column grid.
- Hero text and image stack vertically.

5. **Category Tab Switching:**

In `FeaturedProducts`, click each tab — verify:

- The motion `layoutId="activeTabIndicator"` underline slides smoothly to the active tab.
- The product grid performs `AnimatePresence` crossfade between tab content.
- 4× skeleton cards appear on each tab switch while the new SWR key resolves.

6. **Shop Page URL Sync:**

Navigate to `http://localhost:3000/shop`. Apply filters (category, price range, in-stock toggle, sort). Verify:

- URL updates via `router.replace` on each filter change without full page reload.
- Refreshing the page at the same URL restores filters correctly from `useSearchParams`.
- Shimmer skeleton (6× tiles) appears on filter change, then resolves to results.
- Empty state card renders when no results are returned.

7. **Product Page Gallery:**

Navigate to a product page (`/products/[slug]`). Verify:

- Clicking thumbnail images crossfades the main image with `AnimatePresence`.
- Flash sale countdown displays and ticks if `saleEndsAt` is in the future.
- Quantity `+/-` buttons clamp correctly at 1 (minimum) and `stockCount` (maximum).
- Breadcrumb links navigate correctly: `Home` → `/`, `Category` → `/shop?category=…`.

8. **Page Transition:**

Navigate between `/ → /shop → /products/[slug]`. Verify:

- Each route change triggers the `PageTransition` `fadeInUp` enter animation.
- Browser back/forward also replays transitions.

9. **Footer Links:**

Verify all footer link clusters render correctly and social icon `ActionIcon` buttons are visible against the green (`#4CAF7D`) background.

10. **TypeScript Build Clean:**

```bash
pnpm --filter @my-oxygen/web build
```

_Expected outcome:_ Zero TypeScript errors. No `any`-type leaks from API responses. All `Product`, `Category`, `FlashSale` interfaces are satisfied end-to-end.

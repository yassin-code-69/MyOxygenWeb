"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { Box, Container, Divider, Group, SimpleGrid, Stack, Text, ThemeIcon, type BoxProps } from "@mantine/core";
import {
  IconAward,
  IconCash,
  IconHeartFilled,
  IconLeaf,
  IconShieldCheck,
  IconTruckDelivery,
  IconCalendarCheck,
} from "@tabler/icons-react";
import { ImageWithFallback } from "./ImageWithFallback";
import { formatBDT } from "../lib/format";
import { rankShowcaseCategories } from "./storefront/category-visuals";
import { useCategories } from "../hooks/catalog/use-categories";
import classes from "./storefront/Footer.module.css";

export interface FooterProps {
  /** Top margin (Mantine spacing or any CSS length). Default `60`. */
  mt?: BoxProps["mt"];
  style?: CSSProperties;
  /** Pink "Better Care • Happier Tomorrow" strip above the footer. */
  showAccentStrip?: boolean;
}

/** Delivery rule from the API contract: ৳60 below ৳1,500, free at or above. */
const DELIVERY_FEE = 60;
const FREE_DELIVERY_THRESHOLD = 1500;
const MAX_FOOTER_CATEGORIES = 6;

const TRUST_ITEMS = [
  { label: "Quality Products", icon: IconShieldCheck },
  { label: "Trusted Brand", icon: IconAward },
  { label: "Cash on Delivery", icon: IconCash },
] as const;

const ACCOUNT_LINKS = [
  { label: "Sign in", href: "/login" },
  { label: "Create an account", href: "/register" },
  { label: "My account", href: "/account" },
  { label: "My orders", href: "/orders" },
  { label: "Checkout", href: "/checkout" },
] as const;

function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <li>
      <Link href={href} className={classes.link}>
        {children}
      </Link>
    </li>
  );
}

/**
 * Storefront footer (cream design). Links point only to routes that exist; categories
 * come from the API. No social links or contact details are shown because none exist
 * in the project yet.
 */
export function Footer({ mt = 60, style, showAccentStrip = false }: FooterProps = {}) {
  const { categories } = useCategories();
  const shopCategories = rankShowcaseCategories(categories).slice(0, MAX_FOOTER_CATEGORIES);
  const year = new Date().getFullYear();

  return (
    <Box component="footer" mt={mt} className={classes.root} style={style}>
      {showAccentStrip ? (
        <div className={classes.accentStrip}>
          <Container size="xl" py={12}>
            <Group justify="space-between" gap="sm">
              <Group gap={8}>
                <IconLeaf size={16} color="var(--mo-color-text-success)" aria-hidden />
                <Text size="xs" fw={600} c="var(--mo-color-text-secondary)">
                  Better Care • Happier Tomorrow
                </Text>
              </Group>
              <Group gap={6}>
                <span className={classes.script}>My Oxygen</span>
                <IconHeartFilled size={14} color="var(--mo-color-primary-6)" aria-hidden />
              </Group>
            </Group>
          </Container>
        </div>
      ) : null}

      <Container size="xl" pt={showAccentStrip ? 24 : 40} pb={40}>
        <Group justify="space-between" align="center" wrap="wrap" gap="lg" mb={32}>
          <Group gap="lg" align="center" wrap="wrap">
            <Link href="/" className={classes.brand} aria-label="My Oxygen — home">
              <ImageWithFallback src="/icons/logo-heart.svg" alt="" width={42} height={42} />
              <div>
                <div className={classes.brandName}>My Oxygen</div>
                <Text size="xs" c="dimmed" fw={500}>
                  Healthy Life • Happy You
                </Text>
              </div>
            </Link>
            <Group gap={6} visibleFrom="sm">
              <IconLeaf size={18} color="var(--mo-color-text-success)" aria-hidden />
              <Text size="sm" fw={600} fs="italic" c="var(--mo-color-text-success)">
                For a Healthier Brighter Tomorrow
              </Text>
            </Group>
          </Group>

          <ul className={classes.trustCapsule} aria-label="Why shop with us">
            {TRUST_ITEMS.map(({ label, icon: TrustIcon }) => (
              <Group component="li" key={label} gap={8} wrap="nowrap">
                <ThemeIcon size={28} radius="xl" variant="light" color="secondaryGreen">
                  <TrustIcon size={16} aria-hidden />
                </ThemeIcon>
                <Text size="xs" fw={700} c="var(--mo-color-text)">
                  {label}
                </Text>
              </Group>
            ))}
          </ul>
        </Group>

        <Divider color="var(--mo-color-border-brand)" mb={32} />

        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing={32}>
          <Stack gap="sm">
            <h2 className={classes.heading}>About My Oxygen</h2>
            <Text size="sm" c="var(--mo-color-text-secondary)" lh={1.6}>
              From newborn care to motherhood, skincare and inner wear — essentials for every stage of
              life, delivered across Bangladesh.
            </Text>
            <Group gap={6}>
              <IconLeaf size={15} color="var(--mo-color-text-success)" aria-hidden />
              <Text size="xs" fw={600} fs="italic" c="var(--mo-color-text-brand)">
                Because You Deserve the Best
              </Text>
              <IconHeartFilled size={13} color="var(--mo-color-primary-6)" aria-hidden />
            </Group>
          </Stack>

          <nav aria-label="Shop">
            <h2 className={classes.heading}>Shop</h2>
            <ul className={classes.linkList}>
              <FooterLink href="/products">All products</FooterLink>
              {shopCategories.map((category) => (
                <FooterLink key={category.id} href={`/categories/${category.slug}`}>
                  {category.name}
                </FooterLink>
              ))}
            </ul>
          </nav>

          <nav aria-label="Your account">
            <h2 className={classes.heading}>Your account</h2>
            <ul className={classes.linkList}>
              {ACCOUNT_LINKS.map((link) => (
                <FooterLink key={link.href} href={link.href}>
                  {link.label}
                </FooterLink>
              ))}
            </ul>
          </nav>

          <Stack gap="sm">
            <h2 className={classes.heading}>Shopping with us</h2>
            <div className={classes.fact}>
              <IconTruckDelivery size={18} className={classes.factIcon} aria-hidden />
              <span>
                Free delivery on orders of {formatBDT(FREE_DELIVERY_THRESHOLD)} or more; {formatBDT(DELIVERY_FEE)}{" "}
                below that.
              </span>
            </div>
            <div className={classes.fact}>
              <IconCash size={18} className={classes.factIcon} aria-hidden />
              <span>Pay with cash on delivery.</span>
            </div>
            <div className={classes.fact}>
              <IconCalendarCheck size={18} className={classes.factIcon} aria-hidden />
              <span>Perishable items ship first-expiring batch first, with the expiry date shown.</span>
            </div>
          </Stack>
        </SimpleGrid>

        <Divider color="var(--mo-color-border-brand)" my={28} />

        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Text size="xs" c="var(--mo-color-text-secondary)">
            © {year} My Oxygen. All rights reserved.
          </Text>
          <Text size="xs" c="var(--mo-color-text-secondary)">
            Healthy Life • Happy You
          </Text>
        </Group>
      </Container>
    </Box>
  );
}

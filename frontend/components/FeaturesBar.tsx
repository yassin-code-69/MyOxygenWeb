"use client";

import { Container, Paper, Text, ThemeIcon, type MantineColor } from "@mantine/core";
import { motion } from "motion/react";
import { IconAward, IconCash, IconShieldCheck, IconTruckDelivery, type Icon } from "@tabler/icons-react";
import { fadeInUp, staggerContainer } from "../lib/animations";
import { trustBadges } from "../tokens/trustBadges";
import classes from "./storefront/FeaturesBar.module.css";

type TrustIconName = (typeof trustBadges)[number]["icon"];

const ICONS: Record<TrustIconName, Icon> = {
  award: IconAward,
  "shield-check": IconShieldCheck,
  truck: IconTruckDelivery,
  cash: IconCash,
};

const COLORS: readonly MantineColor[] = ["primaryPink", "secondaryGreen", "accentPurple", "primaryPink"];

/** Trust badges (design-token copy) entering with a staggered fade-up when scrolled into view. */
export function FeaturesBar() {
  return (
    <section aria-label="Why shop with My Oxygen" className={classes.section}>
      <Container size="xl">
        <Paper radius="md" withBorder shadow="card" p={{ base: "md", md: "lg" }}>
          <motion.ul
            className={classes.list}
            variants={staggerContainer}
            initial="initial"
            whileInView="animate"
            viewport={{ once: true, amount: 0.4 }}
          >
            {trustBadges.map((badge, index) => {
              const BadgeIcon = ICONS[badge.icon];
              return (
                <motion.li key={badge.title} variants={fadeInUp} className={classes.item}>
                  <ThemeIcon size={46} radius="xl" variant="light" color={COLORS[index % COLORS.length]}>
                    <BadgeIcon size={22} stroke={2} aria-hidden />
                  </ThemeIcon>
                  <div>
                    <Text fw={700} size="sm" c="var(--mo-color-text)" lh={1.25}>
                      {badge.title}
                    </Text>
                    <Text size="xs" c="dimmed" mt={3} lh={1.25}>
                      {badge.subtitle}
                    </Text>
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>
        </Paper>
      </Container>
    </section>
  );
}

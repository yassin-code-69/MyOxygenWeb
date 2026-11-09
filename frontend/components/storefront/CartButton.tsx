"use client";

import { ActionIcon, Indicator } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
import { IconShoppingBag } from "@tabler/icons-react";
import { useCartStore } from "../../lib/cart-store";

/** Cart total units — `0` until mounted (the cart is persisted in localStorage; avoids hydration mismatches). */
export function useCartCount(): number {
  const mounted = useMounted();
  const count = useCartStore((state) => state.totalCount());
  return mounted ? count : 0;
}

/** Header cart icon with a live units badge; opens the cart drawer. */
export function CartButton() {
  const count = useCartCount();
  const openDrawer = useCartStore((state) => state.openDrawer);
  const label = count > 0 ? `Open cart, ${count} ${count === 1 ? "item" : "items"}` : "Open cart";

  return (
    <Indicator
      label={count > 99 ? "99+" : count}
      disabled={count === 0}
      size={18}
      offset={5}
      color="primaryPink.8"
      withBorder
      inline
      className="mo-tabular-nums"
    >
      <ActionIcon
        variant="subtle"
        color="gray"
        size="lg"
        radius="xl"
        onClick={openDrawer}
        aria-label={label}
        aria-haspopup="dialog"
      >
        <IconShoppingBag size={21} stroke={1.8} />
      </ActionIcon>
    </Indicator>
  );
}

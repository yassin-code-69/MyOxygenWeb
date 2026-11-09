"use client";

import { useCallback } from "react";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useCartStore } from "../../lib/cart-store";
import { isPurchasable, toCartItemDraft } from "../../components/catalog/product-mappers";
import type { CatalogProductDTO } from "../../types/catalog";

export interface AddToCartOptions {
  /** Units to add (clamped to 1…stock by the caller's stepper; the store clamps again). */
  quantity?: number;
  /** Open the cart drawer afterwards (default `true`). */
  openDrawer?: boolean;
  /** Show the confirmation toast (default `true`). */
  notify?: boolean;
}

/**
 * Adds a catalog product to the persisted cart, confirms with a toast and opens the
 * cart drawer. Returns `false` (and explains why) when the product is out of stock.
 */
export function useAddToCart() {
  return useCallback((product: CatalogProductDTO, options: AddToCartOptions = {}): boolean => {
    const { quantity = 1, openDrawer = true, notify = true } = options;

    if (!isPurchasable(product)) {
      notifications.show({
        title: "Out of stock",
        message: `${product.title} is not available right now.`,
        color: "warning",
        icon: <IconAlertCircle size={18} />,
      });
      return false;
    }

    const units = Math.max(1, Math.min(Math.floor(quantity), product.totalStock));
    const cart = useCartStore.getState();
    cart.addItem(toCartItemDraft(product, units));

    if (notify) {
      notifications.show({
        title: "Added to cart",
        message: `${units} × ${product.title}`,
        color: "secondaryGreen",
        icon: <IconCheck size={18} />,
        autoClose: 2500,
      });
    }

    if (openDrawer) {
      cart.openDrawer();
    } else {
      cart.closeDrawer();
    }
    return true;
  }, []);
}

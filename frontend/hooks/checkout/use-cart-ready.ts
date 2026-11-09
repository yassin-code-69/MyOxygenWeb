"use client";

import { useMounted } from "@mantine/hooks";
import { useCartStore } from "../../lib/cart-store";

/**
 * True once the persisted cart can be rendered. The server always renders an
 * empty cart, so cart contents are only shown after mount (no hydration mismatch).
 */
export function useCartReady(): boolean {
  const mounted = useMounted();
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  return mounted && hasHydrated;
}

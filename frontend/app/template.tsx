import type { ReactNode } from "react";
import { PageTransition } from "../components/PageTransition";

/**
 * Re-mounts on every navigation, so each route enters with the `pageTransition`
 * variant. The first server-rendered page is shown without animation (no LCP delay).
 */
export default function Template({ children }: { children: ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}

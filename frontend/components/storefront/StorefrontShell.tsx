"use client";

import type { ReactNode } from "react";
import { Footer, type FooterProps } from "../Footer";
import { Navbar } from "../Navbar";
import classes from "./StorefrontShell.module.css";

export interface StorefrontShellProps {
  children: ReactNode;
  footerProps?: FooterProps;
}

/**
 * Storefront page chrome: header(s), `<main id="main-content">` (target of the global
 * skip link), footer, and bottom padding for the fixed mobile bottom nav
 * (`.mo-bottom-nav-spacer`). The bottom nav itself is mounted once in `app/layout.tsx`.
 */
export function StorefrontShell({ children, footerProps }: StorefrontShellProps) {
  return (
    <div className={`${classes.shell} mo-bottom-nav-spacer`}>
      <Navbar />
      <main id="main-content" tabIndex={-1} className={classes.main}>
        {children}
      </main>
      <Footer {...footerProps} />
    </div>
  );
}

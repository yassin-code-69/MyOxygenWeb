"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import classes from "./PageProgressBar.module.css";

// ---------------------------------------------------------------------------
// Tiny global signal so programmatic navigations (router.push) can drive the bar.
// ---------------------------------------------------------------------------

type ProgressListener = () => void;
const startListeners = new Set<ProgressListener>();

/**
 * Start the top progress bar manually — call right before `router.push()` /
 * `router.replace()`. The bar completes automatically when the route settles.
 */
export function startPageProgress(): void {
  startListeners.forEach((listener) => listener());
}

type Phase = "idle" | "loading" | "completing";

const TRICKLE_MS = 300;
const START_AT = 0.12;
const CEILING = 0.92;
const SAFETY_TIMEOUT_MS = 12_000;

function isModifiedClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

/** Returns true if clicking this anchor will trigger an in-app route change. */
function isInternalNavigation(anchor: HTMLAnchorElement): boolean {
  if (anchor.target && anchor.target !== "_self") {
    return false;
  }
  if (anchor.hasAttribute("download") || anchor.dataset.noProgress !== undefined) {
    return false;
  }
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) {
    return false;
  }
  // Same path + query (hash-only change) does not navigate.
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

/**
 * Glowing brand progress bar for App Router transitions.
 *
 * - Starts on internal link clicks, back/forward (popstate) and `startPageProgress()`.
 * - Trickles toward ~92% while the next route loads, completes when the pathname or
 *   search params change, then fades out.
 * - Animates `transform: scaleX()` and `opacity` only.
 *
 * Must be rendered inside <Suspense> (uses `useSearchParams`). Mounted once in `app/layout.tsx`.
 */
export function PageProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const phaseRef = useRef<Phase>("idle");
  const timers = useRef<{
    trickle?: ReturnType<typeof setInterval>;
    safety?: ReturnType<typeof setTimeout>;
    hide?: ReturnType<typeof setTimeout>;
    reset?: ReturnType<typeof setTimeout>;
  }>({});
  const previousRouteKey = useRef(routeKey);

  const clearTimers = () => {
    const t = timers.current;
    if (t.trickle) {
      clearInterval(t.trickle);
    }
    if (t.safety) {
      clearTimeout(t.safety);
    }
    if (t.hide) {
      clearTimeout(t.hide);
    }
    if (t.reset) {
      clearTimeout(t.reset);
    }
    timers.current = {};
  };

  const updatePhase = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const complete = () => {
    if (phaseRef.current !== "loading") {
      return;
    }
    clearTimers();
    updatePhase("completing");
    setProgress(1);
    timers.current.hide = setTimeout(() => {
      updatePhase("idle");
      timers.current.reset = setTimeout(() => setProgress(0), 320);
    }, 220);
  };

  const start = () => {
    if (phaseRef.current === "loading") {
      return;
    }
    clearTimers();
    updatePhase("loading");
    setProgress(START_AT);
    timers.current.trickle = setInterval(() => {
      setProgress((value) => Math.min(CEILING, value + (CEILING - value) * 0.12));
    }, TRICKLE_MS);
    timers.current.safety = setTimeout(complete, SAFETY_TIMEOUT_MS);
  };

  // Keep the latest closures reachable from the global listeners.
  const startRef = useRef(start);
  const completeRef = useRef(complete);
  startRef.current = start;
  completeRef.current = complete;

  useEffect(() => {
    // Capture phase: Next's <Link> calls preventDefault() in its own handler, so
    // `defaultPrevented` cannot be used to detect client-side navigations.
    const onClick = (event: MouseEvent) => {
      if (isModifiedClick(event)) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement && isInternalNavigation(anchor)) {
        startRef.current();
      }
    };
    const onPopState = () => startRef.current();
    const onManualStart = () => startRef.current();

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPopState);
    startListeners.add(onManualStart);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPopState);
      startListeners.delete(onManualStart);
      clearTimers();
    };
  }, []);

  // Route settled → complete. Navigations that bypassed our start hooks still get a quick sweep.
  useEffect(() => {
    if (previousRouteKey.current === routeKey) {
      return;
    }
    previousRouteKey.current = routeKey;
    if (phaseRef.current !== "loading") {
      startRef.current();
    }
    completeRef.current();
  }, [routeKey]);

  return (
    <div className={classes.root} aria-hidden>
      <div
        className={classes.bar}
        data-phase={phase}
        style={{
          transform: `scaleX(${progress})`,
          opacity: phase === "idle" ? 0 : 1,
        }}
      />
    </div>
  );
}

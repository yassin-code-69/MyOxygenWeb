"use client";

import { useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startPageProgress } from "../../components/PageProgressBar";
import { isStaffRole, type UserRole } from "../../types/auth";
import { sanitizeRedirect } from "./redirect";

/**
 * Where to go after signing in / registering:
 * a safe `?redirect=` path if present, else `/admin` for staff and `/` for customers.
 */
export function usePostAuthRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = sanitizeRedirect(searchParams.get("redirect"));
  const navigatedRef = useRef(false);

  const destinationFor = useCallback(
    (role: UserRole) => redirectTo ?? (isStaffRole(role) ? "/admin" : "/"),
    [redirectTo]
  );

  /** Navigates once (replace, so Back does not return to the auth form). */
  const navigate = useCallback(
    (role: UserRole) => {
      if (navigatedRef.current) {
        return;
      }
      navigatedRef.current = true;
      startPageProgress();
      router.replace(destinationFor(role));
    },
    [destinationFor, router]
  );

  return { redirectTo, destinationFor, navigate };
}

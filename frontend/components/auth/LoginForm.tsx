"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Box, Divider, PasswordInput, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import {
  IconAlertCircle,
  IconHeartHandshake,
  IconInfoCircle,
  IconLock,
  IconLogin2,
  IconUser,
} from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { BrandButton } from "../BrandButton";
import { AuthCard } from "./AuthCard";
import { DevAdminLogin } from "./DevAdminLogin";
import { loginSchema, type LoginFormValues } from "./auth-schemas";
import { useAuthActions } from "../../hooks/auth/use-auth-actions";
import { useAuthReady } from "../../hooks/auth/use-auth-ready";
import { usePostAuthRedirect } from "../../hooks/auth/use-post-auth-redirect";
import { buildRegisterHref } from "../../hooks/auth/redirect";
import { getErrorMessage, isApiError } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import { semantic } from "../../tokens";
import { isStaffRole, type LoginPayload } from "../../types/auth";

/** `/login` — mobile number or email + password. Honours a safe `?redirect=`. */
export function LoginForm() {
  const { login } = useAuthActions();
  const { redirectTo, destinationFor, navigate } = usePostAuthRedirect();
  const ready = useAuthReady();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const currentRole = useAuthStore((state) => state.user?.role ?? null);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [devSubmitting, setDevSubmitting] = useState(false);

  const form = useForm<LoginFormValues>({
    mode: "controlled",
    initialValues: { identifier: "", password: "" },
    validate: zod4Resolver(loginSchema),
    validateInputOnBlur: ["identifier"],
  });

  // A customer sent here from a staff-only page must be able to switch accounts,
  // so they are not bounced back (that would loop between /admin and /login).
  const needsStaffAccount =
    currentRole !== null && !isStaffRole(currentRole) && destinationFor(currentRole).startsWith("/admin");

  // Already signed in (or just signed in): leave the login page.
  useEffect(() => {
    if (ready && isAuthenticated && currentRole && !needsStaffAccount) {
      navigate(currentRole);
    }
  }, [ready, isAuthenticated, currentRole, needsStaffAccount, navigate]);

  const authenticate = async (payload: LoginPayload, viaShortcut = false) => {
    setFormError(null);
    const setBusy = viaShortcut ? setDevSubmitting : setSubmitting;
    setBusy(true);
    try {
      const session = await login(payload);
      notifications.show({
        color: "success",
        title: "Welcome back",
        message: `Signed in as ${session.user.fullName}.`,
      });
      navigate(session.user.role);
    } catch (error) {
      if (isApiError(error) && error.status === 401) {
        setFormError("That mobile number / email and password don't match an account. Please try again.");
        form.setErrors({ identifier: true, password: "Check your password and try again." });
      } else if (isApiError(error) && error.status === 422) {
        const { identifier, password } = error.fieldErrors;
        form.setErrors({ identifier: identifier?.[0], password: password?.[0] });
        setFormError("Please correct the highlighted fields.");
      } else if (isApiError(error) && error.status === 429) {
        setFormError("Too many sign-in attempts. Please wait a minute and try again.");
      } else {
        setFormError(getErrorMessage(error, "We couldn't sign you in. Please try again."));
      }
    } finally {
      setBusy(false);
    }
  };

  const busy = submitting || devSubmitting;

  return (
    <AuthCard
      icon={<IconHeartHandshake size={30} />}
      title="Welcome back"
      subtitle={
        redirectTo === "/checkout"
          ? "Sign in to finish your order — your cart is saved."
          : "Sign in to check out, track your orders and download invoices."
      }
    >
      {process.env.NODE_ENV === "development" ? (
        <DevAdminLogin onLogin={(credentials) => authenticate(credentials, true)} loading={devSubmitting} disabled={busy} />
      ) : null}

      {ready && isAuthenticated && needsStaffAccount ? (
        <Alert color="info" variant="light" radius="md" mb="md" icon={<IconInfoCircle size={18} />}>
          You&apos;re signed in with a customer account. Sign in with a staff account to open the admin portal.
        </Alert>
      ) : null}

      <Box role="alert" aria-live="assertive" mb={formError ? "md" : 0}>
        {formError ? (
          <Alert color="danger" variant="light" radius="md" icon={<IconAlertCircle size={18} />}>
            {formError}
          </Alert>
        ) : null}
      </Box>

      <form noValidate onSubmit={form.onSubmit((values) => authenticate(values))} aria-label="Sign in">
        <Stack gap="md">
          <TextInput
            {...form.getInputProps("identifier")}
            id="login-identifier"
            name="identifier"
            label="Mobile number or email"
            placeholder="01XXXXXXXXX or you@example.com"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            withAsterisk
            leftSection={<IconUser size={16} aria-hidden />}
            disabled={busy}
          />
          <PasswordInput
            {...form.getInputProps("password")}
            id="login-password"
            name="password"
            label="Password"
            placeholder="Your password"
            autoComplete="current-password"
            withAsterisk
            leftSection={<IconLock size={16} aria-hidden />}
            visibilityToggleButtonProps={{ "aria-label": "Show or hide password" }}
            disabled={busy}
          />
          <BrandButton
            type="submit"
            size="md"
            fullWidth
            mt="xs"
            loading={submitting}
            disabled={devSubmitting}
            leftSection={<IconLogin2 size={18} aria-hidden />}
          >
            Sign in
          </BrandButton>
        </Stack>
      </form>

      <Divider my="lg" label="New to My Oxygen?" labelPosition="center" color={semantic.borderBrand} />

      <BrandButton component={Link} href={buildRegisterHref(redirectTo)} variant="outline" fullWidth>
        Create a customer account
      </BrandButton>
    </AuthCard>
  );
}

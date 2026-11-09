"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Anchor, Box, Divider, PasswordInput, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconLock, IconMail, IconPhone, IconSparkles, IconUser, IconUserPlus } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { BrandButton } from "../BrandButton";
import { AuthCard } from "./AuthCard";
import { PasswordStrength } from "./PasswordStrength";
import { PASSWORD_MAX, registerSchema, type RegisterFormValues } from "./auth-schemas";
import { useAuthActions } from "../../hooks/auth/use-auth-actions";
import { useAuthReady } from "../../hooks/auth/use-auth-ready";
import { usePostAuthRedirect } from "../../hooks/auth/use-post-auth-redirect";
import { buildLoginHref } from "../../hooks/auth/redirect";
import { getErrorMessage, isApiError } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import { normalizeBangladeshMobile } from "../../lib/phone";
import { semantic } from "../../tokens";

const API_FIELDS = ["fullName", "phone", "email", "password"] as const;

/** `/register` — new customer account. Honours a safe `?redirect=`. */
export function RegisterForm() {
  const { register } = useAuthActions();
  const { redirectTo, navigate } = usePostAuthRedirect();
  const ready = useAuthReady();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const currentRole = useAuthStore((state) => state.user?.role ?? null);

  const [formError, setFormError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<RegisterFormValues>({
    mode: "controlled",
    initialValues: { fullName: "", phone: "", email: "", password: "", confirmPassword: "" },
    validate: zod4Resolver(registerSchema),
    validateInputOnBlur: ["fullName", "phone", "email", "confirmPassword"],
  });

  useEffect(() => {
    if (ready && isAuthenticated && currentRole) {
      navigate(currentRole);
    }
  }, [ready, isAuthenticated, currentRole, navigate]);

  const handleSubmit = async (values: RegisterFormValues) => {
    setFormError(null);
    setDuplicate(false);
    setSubmitting(true);
    try {
      const session = await register({
        fullName: values.fullName,
        phone: values.phone,
        email: values.email.trim() === "" ? null : values.email,
        password: values.password,
      });
      notifications.show({
        color: "success",
        title: "Account created",
        message: `Welcome to My Oxygen, ${session.user.fullName}!`,
      });
      navigate(session.user.role);
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setDuplicate(true);
        setFormError("An account with this mobile number or email already exists.");
        form.setErrors({
          phone: "This mobile number may already be registered.",
          ...(values.email.trim() ? { email: "This email may already be registered." } : {}),
        });
      } else if (isApiError(error) && error.status === 422) {
        const fieldErrors = error.fieldErrors;
        const mapped: Record<string, string> = {};
        for (const field of API_FIELDS) {
          const message = fieldErrors[field]?.[0];
          if (message) {
            mapped[field] = message;
          }
        }
        form.setErrors(mapped);
        setFormError("Please correct the highlighted fields.");
      } else if (isApiError(error) && error.status === 429) {
        setFormError("Too many attempts. Please wait a minute and try again.");
      } else {
        setFormError(getErrorMessage(error, "We couldn't create your account. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      icon={<IconSparkles size={28} />}
      title="Create your account"
      subtitle="Check out faster, follow your deliveries and keep every invoice in one place."
    >
      <Box role="alert" aria-live="assertive" mb={formError ? "md" : 0}>
        {formError ? (
          <Alert color="danger" variant="light" radius="md" icon={<IconAlertCircle size={18} />}>
            <Stack gap={4}>
              <Text size="sm">{formError}</Text>
              {duplicate ? (
                <Anchor component={Link} href={buildLoginHref(redirectTo)} size="sm" fw={600}>
                  Sign in instead
                </Anchor>
              ) : null}
            </Stack>
          </Alert>
        ) : null}
      </Box>

      <form noValidate onSubmit={form.onSubmit(handleSubmit)} aria-label="Create an account">
        <Stack gap="md">
          <TextInput
            {...form.getInputProps("fullName")}
            id="register-fullName"
            name="fullName"
            label="Full name"
            placeholder="e.g. Fatema Begum"
            autoComplete="name"
            withAsterisk
            leftSection={<IconUser size={16} aria-hidden />}
            disabled={submitting}
          />
          <TextInput
            {...form.getInputProps("phone")}
            id="register-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            label="Mobile number"
            description="Used to sign in and by the courier — e.g. 01712345678"
            placeholder="01XXXXXXXXX"
            autoComplete="tel"
            withAsterisk
            leftSection={<IconPhone size={16} aria-hidden />}
            disabled={submitting}
            onBlur={(event) => {
              const normalized = normalizeBangladeshMobile(event.currentTarget.value);
              if (normalized) {
                form.setFieldValue("phone", normalized);
              }
              form.getInputProps("phone").onBlur?.(event);
            }}
          />
          <TextInput
            {...form.getInputProps("email")}
            id="register-email"
            name="email"
            type="email"
            label="Email (optional)"
            description="For order confirmations and invoices"
            placeholder="you@example.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            leftSection={<IconMail size={16} aria-hidden />}
            disabled={submitting}
          />
          <Stack gap="xs">
            <PasswordInput
              {...form.getInputProps("password")}
              id="register-password"
              name="password"
              label="Password"
              placeholder={`8–${PASSWORD_MAX} characters`}
              autoComplete="new-password"
              withAsterisk
              maxLength={PASSWORD_MAX}
              leftSection={<IconLock size={16} aria-hidden />}
              visibilityToggleButtonProps={{ "aria-label": "Show or hide password" }}
              disabled={submitting}
            />
            <PasswordStrength value={form.values.password} id="register-password-strength" />
          </Stack>
          <PasswordInput
            {...form.getInputProps("confirmPassword")}
            id="register-confirmPassword"
            name="confirmPassword"
            label="Confirm password"
            placeholder="Re-enter your password"
            autoComplete="new-password"
            withAsterisk
            maxLength={PASSWORD_MAX}
            leftSection={<IconLock size={16} aria-hidden />}
            visibilityToggleButtonProps={{ "aria-label": "Show or hide password confirmation" }}
            disabled={submitting}
          />
          <BrandButton
            type="submit"
            size="md"
            fullWidth
            mt="xs"
            loading={submitting}
            leftSection={<IconUserPlus size={18} aria-hidden />}
          >
            Create account
          </BrandButton>
        </Stack>
      </form>

      <Divider my="lg" label="Already have an account?" labelPosition="center" color={semantic.borderBrand} />

      <BrandButton component={Link} href={buildLoginHref(redirectTo)} variant="outline" fullWidth>
        Sign in
      </BrandButton>
    </AuthCard>
  );
}

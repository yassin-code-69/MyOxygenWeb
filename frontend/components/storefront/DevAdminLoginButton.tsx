"use client";

import { useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconBolt } from "@tabler/icons-react";
import { api, getErrorMessage } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import { startPageProgress } from "../PageProgressBar";
import type { AuthSession } from "../../types/auth";

/**
 * "⚡ Dev Admin" one-click login (SPECIFICATION §5).
 *
 * The whole component — including the seeded credentials — lives inside the
 * `process.env.NODE_ENV === "development"` branch. Next inlines `NODE_ENV` at build
 * time, so in production this export is the constant `null` and the function body
 * (credentials included) is removed from the bundle by dead-code elimination.
 */
export const DevAdminLoginButton: ComponentType | null =
  process.env.NODE_ENV === "development"
    ? function DevAdminLoginButton() {
        const router = useRouter();
        const setAuth = useAuthStore((state) => state.setAuth);
        const [loading, setLoading] = useState(false);

        const handleClick = async () => {
          setLoading(true);
          try {
            const session = await api.post<AuthSession>("/auth/login", {
              identifier: "admin@myoxygen.com",
              password: "Admin@MyOxygen2026",
            });
            setAuth({
              user: session.user,
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
            });
            notifications.show({
              title: "Signed in as Super Admin",
              message: "Development shortcut — opening the back-office.",
              color: "secondaryGreen",
            });
            startPageProgress();
            router.push("/admin");
          } catch (error) {
            notifications.show({
              title: "Dev admin login failed",
              message: getErrorMessage(error, "Is the backend running and seeded?"),
              color: "danger",
            });
          } finally {
            setLoading(false);
          }
        };

        return (
          <Button
            type="button"
            size="xs"
            radius="xl"
            variant="outline"
            color="warning"
            loading={loading}
            onClick={handleClick}
            leftSection={<IconBolt size={14} stroke={2.2} aria-hidden />}
            title="Development only: sign in as the seeded Super Admin"
          >
            Dev Admin
          </Button>
        );
      }
    : null;

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Container,
  Paper,
  Title,
  Text,
  TextInput,
  PasswordInput,
  Button,
  Group,
  Stack,
  Divider,
  Alert,
  Box,
  SegmentedControl,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconHeartHandshake,
  IconSparkles,
  IconShieldLock,
  IconPhone,
  IconMail,
  IconLock,
  IconAlertCircle,
} from "@tabler/icons-react";
import { apiPost } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import { myOxygenColors } from "../../tokens";
import { Navbar } from "../../components/Navbar";

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [mode, setMode] = useState<"phone" | "email">("phone");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [devLoading, setDevLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!identifier.trim()) {
      setErrorMsg(mode === "phone" ? "Please enter your phone number" : "Please enter your email");
      return;
    }

    if (!password) {
      setErrorMsg("Please enter your password");
      return;
    }

    try {
      setLoading(true);
      const res = await apiPost<{
        success: boolean;
        data: {
          user: { id: string; fullName: string; email: string | null; phone: string; role: string };
          accessToken: string;
          refreshToken?: string;
        };
        error?: any;
      }>("/auth/login", {
        identifier: identifier.trim(),
        password,
      });

      if (!res.success || !res.data) {
        throw new Error(typeof res.error === "string" ? res.error : "Login failed. Please check your credentials.");
      }

      setAuth({
        user: res.data.user,
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
      });

      notifications.show({
        title: "Welcome Back! 👋",
        message: `Logged in as ${res.data.user.fullName}`,
        color: "teal",
      });

      if (res.data.user.role === "SUPER_ADMIN") {
        router.push("/admin");
      } else {
        router.push("/products");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  // Shortcut to login as seeded Super Admin
  const handleDevAdminLogin = async () => {
    try {
      setDevLoading(true);
      setErrorMsg(null);
      const res = await apiPost<{
        success: boolean;
        data: {
          user: { id: string; fullName: string; email: string; phone: string; role: string };
          accessToken: string;
          refreshToken?: string;
        };
        error?: any;
      }>("/auth/login", {
        identifier: "admin@myoxygen.com",
        password: "Admin@MyOxygen2026",
      });

      if (!res.success || !res.data) {
        throw new Error(typeof res.error === "string" ? res.error : "Dev admin login failed");
      }

      setAuth({
        user: res.data.user,
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
      });

      notifications.show({
        title: "⚡ Dev Admin Login Successful",
        message: "Authenticated as System Super Admin. Redirecting to /admin...",
        color: "teal",
      });

      router.push("/admin");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to login as dev admin");
    } finally {
      setDevLoading(false);
    }
  };

  return (
    <>
      <Navbar />

      <Container size="xs" py={60}>
        <Paper
          radius="xl"
          p={36}
          withBorder
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: "#FFE4EC",
            boxShadow: "0 10px 30px rgba(255, 107, 139, 0.08)",
          }}
        >
          {/* Header */}
          <Stack align="center" gap={6} mb={24}>
            <Box
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #FF6B8B 0%, #4CAF7D 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                boxShadow: "0 6px 16px rgba(255, 107, 139, 0.3)",
              }}
            >
              <IconHeartHandshake size={30} />
            </Box>
            <Title
              order={2}
              style={{
                fontFamily: "var(--font-poppins)",
                color: myOxygenColors.darkText,
                fontWeight: 700,
                marginTop: 8,
              }}
            >
              Welcome to My Oxygen
            </Title>
            <Text size="sm" c="dimmed" ta="center">
              Login to track your orders, view saved items, and enjoy personalized care.
            </Text>
          </Stack>

          {/* Dev Quick Admin Login Banner */}
          <Paper
            radius="md"
            p="sm"
            mb={24}
            style={{
              backgroundColor: "#FFF0F3",
              border: "1.5px dashed #FF6B8B",
            }}
          >
            <Group justify="space-between" align="center" wrap="nowrap">
              <Box>
                <Group gap={6}>
                  <IconSparkles size={16} color={myOxygenColors.primaryPink} />
                  <Text size="xs" fw={700} c={myOxygenColors.primaryPink}>
                    Dev Testing Shortcut
                  </Text>
                </Group>
                <Text size="11px" c="dimmed" mt={2}>
                  1-click login as seeded Super Admin
                </Text>
              </Box>

              <Button
                size="xs"
                radius="xl"
                color="pink"
                loading={devLoading}
                leftSection={<IconShieldLock size={14} />}
                onClick={handleDevAdminLogin}
                style={{
                  backgroundColor: myOxygenColors.primaryPink,
                  fontWeight: 700,
                }}
              >
                Login as Admin
              </Button>
            </Group>
          </Paper>

          {/* Error Alert */}
          {errorMsg && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              radius="md"
              mb={20}
              title="Authentication Notice"
            >
              {errorMsg}
            </Alert>
          )}

          {/* Mode Switcher */}
          <SegmentedControl
            fullWidth
            radius="xl"
            size="sm"
            mb={20}
            value={mode}
            onChange={(val) => {
              setMode(val as "phone" | "email");
              setIdentifier("");
              setErrorMsg(null);
            }}
            data={[
              { label: "📱 Mobile Phone", value: "phone" },
              { label: "✉️ Email Address", value: "email" },
            ]}
          />

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              {mode === "phone" ? (
                <TextInput
                  label="Phone Number"
                  placeholder="+8801700000000 or 01700000000"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  leftSection={<IconPhone size={16} color="#9CA3AF" />}
                />
              ) : (
                <TextInput
                  label="Email Address"
                  placeholder="your.email@example.com"
                  required
                  type="email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  leftSection={<IconMail size={16} color="#9CA3AF" />}
                />
              )}

              <PasswordInput
                label="Password"
                placeholder="Enter your account password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftSection={<IconLock size={16} color="#9CA3AF" />}
              />

              <Button
                type="submit"
                fullWidth
                radius="xl"
                size="md"
                mt="sm"
                loading={loading}
                style={{
                  backgroundColor: myOxygenColors.primaryPink,
                  boxShadow: "0 4px 14px rgba(255, 107, 139, 0.35)",
                  fontWeight: 600,
                }}
              >
                Sign In
              </Button>
            </Stack>
          </form>

          <Divider my={24} label="Don't have an account yet?" labelPosition="center" />

          <Button
            component={Link}
            href="/register"
            fullWidth
            variant="light"
            color="pink"
            radius="xl"
            size="md"
            style={{ fontWeight: 600 }}
          >
            Create New Customer Account
          </Button>
        </Paper>
      </Container>
    </>
  );
}

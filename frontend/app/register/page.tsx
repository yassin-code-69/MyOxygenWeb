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
  Stack,
  Divider,
  Alert,
  Box,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconHeartHandshake,
  IconUser,
  IconPhone,
  IconMail,
  IconLock,
  IconAlertCircle,
  IconCheck,
} from "@tabler/icons-react";
import { apiPost } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import { myOxygenColors } from "../../tokens";
import { Navbar } from "../../components/Navbar";

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    // Bangladeshi phone normalization check
    const cleanedPhone = phone.trim();
    const bdRegex = /^(\+880|880|0)1[3-9]\d{8}$/;
    if (!bdRegex.test(cleanedPhone)) {
      setErrorMsg("Please enter a valid Bangladeshi mobile number (e.g. 01712345678 or +8801712345678)");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long");
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
      }>("/auth/register", {
        fullName: fullName.trim(),
        phone: cleanedPhone,
        email: email.trim() ? email.trim() : undefined,
        password,
      });

      if (!res.success || !res.data) {
        throw new Error(typeof res.error === "string" ? res.error : "Registration failed. Please try again.");
      }

      setAuth({
        user: res.data.user,
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
      });

      notifications.show({
        title: "Account Created! 🎉",
        message: `Welcome to My Oxygen, ${res.data.user.fullName}!`,
        color: "teal",
        icon: <IconCheck size={16} />,
      });

      router.push("/products");
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during registration");
    } finally {
      setLoading(false);
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
              Join My Oxygen Family
            </Title>
            <Text size="sm" c="dimmed" ta="center">
              Create an account for quick checkout, order tracking, and exclusive discounts.
            </Text>
          </Stack>

          {/* Error Alert */}
          {errorMsg && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              color="red"
              radius="md"
              mb={20}
              title="Registration Notice"
            >
              {errorMsg}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              <TextInput
                label="Full Name"
                placeholder="e.g. Fatima Rahman"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                leftSection={<IconUser size={16} color="#9CA3AF" />}
              />

              <TextInput
                label="Bangladeshi Mobile Phone"
                placeholder="01712345678"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                leftSection={<IconPhone size={16} color="#9CA3AF" />}
              />

              <TextInput
                label="Email Address (Optional)"
                placeholder="fatima@example.com"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftSection={<IconMail size={16} color="#9CA3AF" />}
              />

              <PasswordInput
                label="Password"
                placeholder="Choose a strong password (min 8 chars)"
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
                Create Account
              </Button>
            </Stack>
          </form>

          <Divider my={24} label="Already have an account?" labelPosition="center" />

          <Button
            component={Link}
            href="/login"
            fullWidth
            variant="light"
            color="pink"
            radius="xl"
            size="md"
            style={{ fontWeight: 600 }}
          >
            Sign In to Existing Account
          </Button>
        </Paper>
      </Container>
    </>
  );
}

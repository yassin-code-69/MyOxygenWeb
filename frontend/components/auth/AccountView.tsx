"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Button, Container, Divider, Grid, Group, Paper, Skeleton, Stack, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconChevronRight,
  IconLogout,
  IconReceipt2,
  IconShieldLock,
  IconShoppingBag,
} from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { startPageProgress } from "../PageProgressBar";
import { formatDhakaDate } from "../orders/order-format";
import { useAuthActions } from "../../hooks/auth/use-auth-actions";
import { useRequireAuth } from "../../hooks/auth/use-auth-ready";
import { useProfile } from "../../hooks/auth/use-profile";
import { formatBangladeshMobile } from "../../lib/phone";
import { semantic } from "../../tokens";
import { isStaffRole, type UserRole } from "../../types/auth";

const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "Super admin",
  INVENTORY_MANAGER: "Inventory manager",
  ORDER_MANAGER: "Order manager",
  MARKETING_MANAGER: "Marketing manager",
  SUPPORT_STAFF: "Support staff",
  CUSTOMER: "Customer",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      {value ? (
        <Text size="sm" fw={600} c={semantic.text} style={{ wordBreak: "break-word" }}>
          {value}
        </Text>
      ) : (
        <Text size="sm" c="dimmed" fs="italic">
          Not added
        </Text>
      )}
    </Stack>
  );
}

function AccountSkeleton() {
  return (
    <Container size="sm" py={{ base: "lg", md: "xl" }} aria-busy="true" aria-label="Loading account">
      <Skeleton h={30} w={180} radius="xl" mb="lg" />
      <Paper withBorder radius="md" p="lg" bg={semantic.surface}>
        <Group wrap="nowrap" mb="lg">
          <Skeleton circle h={56} />
          <Stack gap={8} style={{ flex: 1 }}>
            <Skeleton h={18} w="50%" radius="xl" />
            <Skeleton h={14} w={90} radius="xl" />
          </Stack>
        </Group>
        <Grid gap="md">
          {[0, 1, 2].map((cell) => (
            <Grid.Col key={cell} span={{ base: 12, sm: 4 }}>
              <Skeleton h={10} w={60} radius="xl" mb={8} />
              <Skeleton h={14} w="80%" radius="xl" />
            </Grid.Col>
          ))}
        </Grid>
      </Paper>
    </Container>
  );
}

/** `/account` — profile from `GET /auth/me`, shortcuts and sign-out. */
export function AccountView() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const { status, user } = useRequireAuth("/account", { redirect: !signingOut });
  const { profile, isLoading } = useProfile(status === "authenticated");
  const { logout } = useAuthActions();

  if (status !== "authenticated" || !user || (isLoading && !profile)) {
    return <AccountSkeleton />;
  }

  const person = profile ?? user;
  const memberSince = profile ? formatDhakaDate(profile.createdAt) : null;
  const staff = isStaffRole(person.role);

  const handleLogout = async () => {
    setSigningOut(true);
    startPageProgress();
    router.replace("/");
    await logout();
    notifications.show({ color: "success", title: "Signed out", message: "See you again soon!" });
  };

  return (
    <Container size="sm" py={{ base: "lg", md: "xl" }}>
      <Title order={1} size="h2" c={semantic.text} mb="lg">
        My account
      </Title>

      <Paper withBorder radius="md" p={{ base: "md", sm: "lg" }} bg={semantic.surface} shadow="card">
        <Group wrap="nowrap" gap="md" mb="lg">
          <Avatar size={56} radius="xl" color="primaryPink" variant="light" aria-hidden>
            {initials(person.fullName)}
          </Avatar>
          <Stack gap={4} style={{ minWidth: 0 }}>
            <Text fw={700} size="lg" c={semantic.text} style={{ wordBreak: "break-word" }}>
              {person.fullName}
            </Text>
            <Group gap="xs">
              <Badge color={staff ? "accentPurple" : "secondaryGreen"} variant="light" tt="none">
                {ROLE_LABEL[person.role]}
              </Badge>
              {memberSince ? (
                <Text size="xs" c="dimmed">
                  Member since {memberSince}
                </Text>
              ) : null}
            </Group>
          </Stack>
        </Group>

        <Grid gap="md">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Detail label="Mobile number" value={formatBangladeshMobile(person.phone)} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Detail label="Email" value={person.email} />
          </Grid.Col>
        </Grid>
      </Paper>

      <Paper withBorder radius="md" p="xs" mt="lg" bg={semantic.surface} component="nav" aria-label="Account shortcuts">
        <Stack gap={0}>
          <Button
            component={Link}
            href="/orders"
            variant="subtle"
            color="gray"
            justify="space-between"
            fullWidth
            h={52}
            leftSection={<IconReceipt2 size={18} aria-hidden />}
            rightSection={<IconChevronRight size={16} aria-hidden />}
          >
            My orders
          </Button>
          <Divider color={semantic.borderBrand} />
          <Button
            component={Link}
            href="/products"
            variant="subtle"
            color="gray"
            justify="space-between"
            fullWidth
            h={52}
            leftSection={<IconShoppingBag size={18} aria-hidden />}
            rightSection={<IconChevronRight size={16} aria-hidden />}
          >
            Continue shopping
          </Button>
          {staff ? (
            <>
              <Divider color={semantic.borderBrand} />
              <Button
                component={Link}
                href="/admin"
                variant="subtle"
                color="gray"
                justify="space-between"
                fullWidth
                h={52}
                leftSection={<IconShieldLock size={18} aria-hidden />}
                rightSection={<IconChevronRight size={16} aria-hidden />}
              >
                Admin portal
              </Button>
            </>
          ) : null}
        </Stack>
      </Paper>

      <Group justify="center" mt="xl">
        <BrandButton variant="outline" onClick={handleLogout} leftSection={<IconLogout size={16} aria-hidden />}>
          Sign out
        </BrandButton>
      </Group>
    </Container>
  );
}

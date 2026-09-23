"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Box,
  Container,
  Group,
  Text,
  Badge,
  Button,
  Tooltip,
} from "@mantine/core";
import {
  IconPackage,
  IconHistory,
  IconBuildingStore,
  IconShieldCheck,
} from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

export function AdminHeader() {
  const pathname = usePathname();

  const navItems = [
    {
      label: "Batch Inspector",
      href: "/admin/batches",
      icon: IconPackage,
      description: "FEFO & Expiry Health",
    },
    {
      label: "Stock Audit Ledger",
      href: "/admin/ledger",
      icon: IconHistory,
      description: "Inventory Trail & Adjustments",
    },
  ];

  return (
    <Box
      component="header"
      style={{
        backgroundColor: "#FFFFFF",
        borderBottom: "1px solid #FEE2E2",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
      }}
    >
      <Container size="xl" py="sm">
        <Group justify="space-between" align="center">
          {/* Brand & Admin Badge */}
          <Group gap="sm">
            <Link
              href="/admin/batches"
              style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}
            >
              <Box
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #FF6B8B 0%, #4CAF7D 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  fontSize: 18,
                  boxShadow: "0 2px 8px rgba(255, 107, 139, 0.25)",
                }}
              >
                O₂
              </Box>
              <Box>
                <Group gap={6} align="center">
                  <Text
                    fw={700}
                    size="md"
                    style={{
                      fontFamily: "var(--font-poppins)",
                      color: myOxygenColors.darkText,
                      letterSpacing: "-0.01em",
                      lineHeight: 1.2,
                    }}
                  >
                    My Oxygen
                  </Text>
                  <Badge
                    color="pink"
                    variant="filled"
                    size="xs"
                    radius="sm"
                    style={{
                      backgroundColor: myOxygenColors.primaryPink,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                    }}
                  >
                    ADMIN
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed" style={{ lineHeight: 1.2 }}>
                  Inventory & Stock Audit Control
                </Text>
              </Box>
            </Link>
          </Group>

          {/* Navigation Tabs */}
          <Group gap="xs">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
              const Icon = item.icon;

              return (
                <Button
                  key={item.href}
                  component={Link}
                  href={item.href}
                  variant={isActive ? "light" : "subtle"}
                  color="pink"
                  leftSection={<Icon size={18} stroke={isActive ? 2.2 : 1.7} />}
                  radius="md"
                  size="sm"
                  style={{
                    backgroundColor: isActive ? "#FFF0F3" : "transparent",
                    color: isActive ? myOxygenColors.primaryPinkActive : myOxygenColors.darkText,
                    fontWeight: isActive ? 650 : 500,
                    border: isActive ? "1px solid #FFE3E8" : "1px solid transparent",
                    transition: "all 150ms ease",
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Group>

          {/* Storefront Link & Security indicator */}
          <Group gap="sm">
            <Group gap={6} visibleFrom="sm">
              <IconShieldCheck size={16} color={myOxygenColors.secondaryGreen} />
              <Text size="xs" fw={500} c="dimmed">
                Authorized Personnel
              </Text>
            </Group>

            <Tooltip label="Back to Customer Storefront" position="bottom" withArrow>
              <Button
                component={Link}
                href="/"
                variant="outline"
                color="gray"
                size="xs"
                radius="md"
                leftSection={<IconBuildingStore size={14} />}
                style={{
                  borderColor: "#E5E7EB",
                  color: myOxygenColors.darkText,
                }}
              >
                View Store
              </Button>
            </Tooltip>
          </Group>
        </Group>
      </Container>
    </Box>
  );
}

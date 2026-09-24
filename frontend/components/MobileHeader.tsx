"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Box,
  Group,
  Text,
  TextInput,
  Badge,
  ActionIcon,
  UnstyledButton,
  Image,
} from "@mantine/core";
import {
  IconMapPin,
  IconChevronRight,
  IconSearch,
  IconGridDots,
  IconCamera,
  IconBell,
  IconCoins,
  IconHeart,
} from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

const QUICK_CATEGORIES = [
  {
    name: "Newborn",
    slug: "newborn",
    icon: "/icons/newborn.svg",
    bg: "#FFF0F3",
  },
  {
    name: "Mother Care",
    slug: "mother-care",
    icon: "/icons/mother-care.svg",
    bg: "#EDFBF3",
  },
  {
    name: "Skin Care",
    slug: "skin-care",
    icon: "/icons/skin-care.svg",
    bg: "#F5F3FF",
  },
  {
    name: "Inner Wear",
    slug: "inner-wear",
    icon: "/icons/inner-wear.svg",
    bg: "#FFF1F2",
  },
];

export function MobileHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/products?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <Box
      className="mobile-header-wrapper"
      style={{
        background: "linear-gradient(180deg, #FFE8E1 0%, #FFF2EE 70%, #FFF8F6 100%)",
        padding: "12px 14px 14px 14px",
        borderBottom: "1px solid #FFE4EC",
        position: "sticky",
        top: 0,
        zIndex: 1000,
      }}
    >
      {/* 1. Top Location Bar & Reward Points Badge */}
      <Group justify="space-between" align="center" mb={10}>
        <Group gap={4} style={{ cursor: "pointer" }}>
          <IconMapPin size={16} color={myOxygenColors.primaryPink} />
          <Text size="xs" fw={700} c={myOxygenColors.darkText}>
            Deliver to: Banani, Dhaka
          </Text>
          <IconChevronRight size={14} color="#9CA3AF" />
        </Group>

        <Group gap={6}>
          <Badge
            variant="gradient"
            gradient={{ from: "#F59E0B", to: "#D97706", deg: 90 }}
            radius="xl"
            size="sm"
            leftSection={<IconCoins size={12} color="#FFFFFF" />}
            style={{ fontWeight: 700, paddingLeft: 6, paddingRight: 8 }}
          >
            20 ৳
          </Badge>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius="xl"
            size="sm"
            onClick={() => router.push("/products")}
          >
            <IconBell size={18} color="#6B7280" />
          </ActionIcon>
        </Group>
      </Group>

      {/* 2. Floating Search Bar with Grid Category Pill and Camera Action */}
      <form onSubmit={handleSearch}>
        <Group gap={8} wrap="nowrap" align="center">
          {/* Category Quick Selector Pill */}
          <ActionIcon
            size="lg"
            radius="xl"
            variant="white"
            onClick={() => router.push("/products")}
            style={{
              backgroundColor: "#FFFFFF",
              border: "1.5px solid #FBCFE8",
              boxShadow: "0 2px 8px rgba(255, 107, 139, 0.08)",
              minWidth: 42,
              height: 42,
            }}
          >
            <IconGridDots size={20} color={myOxygenColors.primaryPink} />
          </ActionIcon>

          {/* Search Pill */}
          <TextInput
            placeholder="Search mother & baby essentials..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leftSection={<IconSearch size={16} color="#9CA3AF" />}
            rightSection={
              <ActionIcon variant="subtle" size="sm" color="gray">
                <IconCamera size={16} color="#9CA3AF" />
              </ActionIcon>
            }
            radius="xl"
            size="sm"
            style={{ flex: 1 }}
            styles={{
              input: {
                backgroundColor: "#FFFFFF",
                borderColor: "#FBCFE8",
                height: 42,
                fontSize: 13,
                boxShadow: "0 2px 8px rgba(255, 107, 139, 0.06)",
              },
            }}
          />
        </Group>
      </form>

      {/* 3. Circular Category Icon Strip (Matching mobile view.jpeg) */}
      <Box
        mt={12}
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 4,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {QUICK_CATEGORIES.map((cat) => (
          <Link
            key={cat.slug}
            href={cat.slug === "all" ? "/products" : `/categories/${cat.slug}`}
            style={{ textDecoration: "none" }}
          >
            <Box
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 62,
                flexShrink: 0,
              }}
            >
              <Box
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: "50%",
                  backgroundColor: cat.bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.8)",
                  transition: "transform 150ms ease",
                }}
              >
                <Image src={cat.icon} alt={cat.name} w={28} h={28} fit="contain" />
              </Box>
              <Text
                size="11px"
                mt={4}
                fw={600}
                c={myOxygenColors.darkText}
                ta="center"
                style={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  width: "100%",
                }}
              >
                {cat.name}
              </Text>
            </Box>
          </Link>
        ))}
      </Box>

      <style jsx global>{`
        @media (min-width: 768px) {
          .mobile-header-wrapper {
            display: none !important;
          }
        }
      `}</style>
    </Box>
  );
}

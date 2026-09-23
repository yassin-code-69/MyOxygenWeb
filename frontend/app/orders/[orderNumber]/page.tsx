"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import {
  Container,
  Paper,
  Box,
  Title,
  Text,
  Group,
  Stack,
  Badge,
  Divider,
  Button,
  ThemeIcon,
  Timeline,
  Alert,
} from "@mantine/core";
import {
  IconCheck,
  IconTruck,
  IconPackage,
  IconClock,
  IconReceipt2,
  IconShieldCheck,
  IconHome,
  IconShoppingBag,
} from "@tabler/icons-react";
import { motion } from "motion/react";

import { Navbar } from "../../../components/Navbar";
import { Footer } from "../../../components/Footer";
import { MobileBottomNav } from "../../../components/MobileBottomNav";
import { BrandButton } from "../../../components/BrandButton";
import { apiGet } from "../../../lib/api-client";
import { myOxygenColors } from "../../../tokens";

export default function OrderSuccessPage() {
  const params = useParams<{ orderNumber: string }>();
  const router = useRouter();
  const orderNumber = params?.orderNumber || "";

  // Fetch order detail from backend
  const { data, isLoading } = useSWR(
    orderNumber ? `/orders/${orderNumber}` : null,
    () => apiGet<{ success: boolean; data: any }>(`/orders/${orderNumber}`).catch(() => null),
    { revalidateOnFocus: false }
  );

  const order = data?.data;

  return (
    <Box style={{ minHeight: "100vh", paddingBottom: 60 }}>
      <Navbar />

      <Container size="md" py="3rem">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <Paper
            p={{ base: "xl", md: "3rem" }}
            radius="xl"
            style={{
              backgroundColor: "#FFFFFF",
              border: "1px solid #E5E7EB",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.04)",
              textAlign: "center",
            }}
          >
            {/* Animated Celebration Icon */}
            <Box
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                backgroundColor: "#E8F8F0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                color: "#4CAF7D",
                boxShadow: "0 4px 20px rgba(76, 175, 125, 0.2)",
              }}
            >
              <IconCheck size={44} stroke={3} />
            </Box>

            <Badge size="lg" color="teal" variant="light" mb="sm">
              Order Confirmed & Logged
            </Badge>

            <Title
              order={1}
              style={{
                fontFamily: "var(--font-poppins)",
                fontSize: "2.2rem",
                color: myOxygenColors.darkText,
                marginBottom: 8,
              }}
            >
              Thank You for Your Order!
            </Title>

            <Text size="md" c="dimmed" mb="xl">
              Your order has been verified and stock allocated via FEFO batch protection.
            </Text>

            {/* Order Reference Box */}
            <Paper
              p="md"
              radius="lg"
              mb="xl"
              style={{
                backgroundColor: "#FFF8F6",
                border: "1px dashed #FF6B8B",
                display: "inline-block",
              }}
            >
              <Group gap="sm" justify="center">
                <IconReceipt2 size={20} color={myOxygenColors.primaryPink} />
                <Text size="sm" fw={600} c={myOxygenColors.darkText}>
                  Order Reference:
                </Text>
                <Text
                  size="md"
                  fw={800}
                  c={myOxygenColors.primaryPink}
                  style={{ letterSpacing: 1 }}
                >
                  {orderNumber}
                </Text>
              </Group>
            </Paper>

            <Divider my="lg" />

            {/* Tracking & Timeline */}
            <Box style={{ textAlign: "left" }} my="xl">
              <Title order={3} size="h5" c={myOxygenColors.darkText} mb="md">
                Estimated Delivery & Fulfillment
              </Title>

              <Timeline active={1} bulletSize={28} lineWidth={2} color="teal">
                <Timeline.Item
                  bullet={<IconReceipt2 size={16} />}
                  title="Order Placed & Stock Reserved"
                >
                  <Text size="xs" c="dimmed" mt={4}>
                    Verified perishable batch reserved for zero expiration risk.
                  </Text>
                </Timeline.Item>

                <Timeline.Item
                  bullet={<IconPackage size={16} />}
                  title="Processing & Packaging"
                >
                  <Text size="xs" c="dimmed" mt={4}>
                    Carefully packed in hygienic climate-controlled environment.
                  </Text>
                </Timeline.Item>

                <Timeline.Item
                  bullet={<IconTruck size={16} />}
                  title="Dispatched via Steadfast Courier"
                >
                  <Text size="xs" c="dimmed" mt={4}>
                    Delivery within 24-48 hours across Bangladesh. Tracking SMS will be sent to your phone.
                  </Text>
                </Timeline.Item>
              </Timeline>
            </Box>

            {/* Order details summary if available */}
            {order && (
              <Box style={{ textAlign: "left" }} mb="xl">
                <Title order={3} size="h5" c={myOxygenColors.darkText} mb="sm">
                  Order Details
                </Title>
                <Paper p="md" radius="md" style={{ backgroundColor: "#F9FAFB" }}>
                  <Stack gap={6}>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        Recipient:
                      </Text>
                      <Text size="xs" fw={600}>
                        {order.shippingAddress?.fullName}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        Phone:
                      </Text>
                      <Text size="xs" fw={600}>
                        {order.shippingAddress?.phone}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        Delivery Address:
                      </Text>
                      <Text size="xs" fw={600} style={{ textAlign: "right" }}>
                        {order.shippingAddress?.addressLine1}, {order.shippingAddress?.city}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        Payment Method:
                      </Text>
                      <Badge size="xs" color="gray">
                        {order.paymentMethod || "CASH_ON_DELIVERY"}
                      </Badge>
                    </Group>
                    <Group justify="space-between">
                      <Text size="xs" c="dimmed">
                        Total Amount:
                      </Text>
                      <Text size="sm" fw={800} c={myOxygenColors.primaryPink}>
                        ৳ {order.total}
                      </Text>
                    </Group>
                  </Stack>
                </Paper>
              </Box>
            )}

            {/* Assurance Alert */}
            <Alert
              icon={<IconShieldCheck size={20} color="#2C7A52" />}
              title="Maternal Trust & Authentic Quality"
              mb="xl"
              styles={{
                root: {
                  backgroundColor: "#E8F8F0",
                  border: "1px solid #4CAF7D",
                  borderRadius: 12,
                  textAlign: "left",
                },
                title: { color: "#205B3D", fontWeight: 700 },
                message: { color: "#2C7A52", fontSize: 13 },
              }}
            >
              Every product in your parcel is 100% genuine and verified against batch expiration dates. Need help? Contact customer care at <b>+880 1700-000000</b>.
            </Alert>

            {/* Navigation Buttons */}
            <Group justify="center" gap="md">
              <Button
                component={Link}
                href="/"
                variant="light"
                color="gray"
                size="md"
                radius="xl"
                leftSection={<IconHome size={18} />}
              >
                Back to Home
              </Button>

              <BrandButton
                component={Link}
                href="/products"
                variant="primary"
                size="md"
                radius="xl"
                leftSection={<IconShoppingBag size={18} />}
              >
                Continue Shopping
              </BrandButton>
            </Group>
          </Paper>
        </motion.div>
      </Container>

      <Footer />
      <MobileBottomNav />
    </Box>
  );
}

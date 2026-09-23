"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Container,
  Grid,
  Box,
  Text,
  Title,
  Stepper,
  TextInput,
  Textarea,
  Radio,
  Group,
  Stack,
  Paper,
  Button,
  Divider,
  Badge,
  Image,
  Alert,
  ActionIcon,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconTruck,
  IconCreditCard,
  IconChecklist,
  IconShieldCheck,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconAlertCircle,
  IconBuildingStore,
  IconCash,
  IconDeviceMobile,
  IconShoppingBag,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";

import { Navbar } from "../../components/Navbar";
import { Footer } from "../../components/Footer";
import { MobileBottomNav } from "../../components/MobileBottomNav";
import { BrandButton } from "../../components/BrandButton";
import { useCartStore } from "../../lib/cart-store";
import { apiPost } from "../../lib/api-client";
import { myOxygenColors } from "../../tokens";
import { fadeInUp } from "../../lib/animations";

export default function CheckoutPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const items = useCartStore((state) => state.items);
  const subtotal = useCartStore((state) => state.subtotal());
  const shippingFee = useCartStore((state) => state.shippingFee());
  const appliedCoupon = useCartStore((state) => state.appliedCoupon);
  const finalTotal = useCartStore((state) => state.finalTotal());
  const clearCart = useCartStore((state) => state.clearCart);

  const [activeStep, setActiveStep] = useState(0);

  // Step 1: Shipping Address State
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("Dhaka");
  const [district, setDistrict] = useState("Dhaka");
  const [postalCode, setPostalCode] = useState("1205");

  const [addressErrors, setAddressErrors] = useState<Record<string, string>>({});

  // Step 2: Payment Method
  const [paymentMethod, setPaymentMethod] = useState<"CASH_ON_DELIVERY" | "ONLINE_GATEWAY">(
    "CASH_ON_DELIVERY"
  );

  // Step 3: Submission
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Validate Bangladesh phone: 01[3-9]\d{8} or +8801[3-9]\d{8}
  const validatePhone = (val: string) => {
    const cleaned = val.trim();
    return /^(\+880|880|0)?1[3-9]\d{8}$/.test(cleaned);
  };

  const validateStep1 = () => {
    const errors: Record<string, string> = {};

    if (!fullName.trim() || fullName.trim().length < 2) {
      errors.fullName = "Please enter your full name (at least 2 characters)";
    }

    if (!validatePhone(phone)) {
      errors.phone = "Enter a valid Bangladeshi mobile number (e.g. 01712345678)";
    }

    if (!addressLine1.trim() || addressLine1.trim().length < 5) {
      errors.addressLine1 = "Please enter your delivery street address";
    }

    if (!city.trim()) {
      errors.city = "City is required";
    }

    if (!district.trim()) {
      errors.district = "District is required";
    }

    if (!/^\d{4}$/.test(postalCode.trim())) {
      errors.postalCode = "Enter a 4-digit postal code (e.g. 1205)";
    }

    setAddressErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (activeStep === 0) {
      if (!validateStep1()) return;
    }
    setActiveStep((current) => Math.min(current + 1, 2));
  };

  const handlePrevStep = () => {
    setActiveStep((current) => Math.max(current - 1, 0));
  };

  // Helper to ensure an access token exists (seamless guest auto-auth if not logged in)
  const ensureAuthenticated = async () => {
    const storedToken = typeof window !== "undefined" ? localStorage.getItem("my_oxygen_token") : null;
    if (storedToken) return storedToken;

    // Auto-register/login as customer
    const formattedPhone = phone.trim().startsWith("+88")
      ? phone.trim()
      : phone.trim().startsWith("88")
      ? `+${phone.trim()}`
      : phone.trim().startsWith("0")
      ? `+88${phone.trim()}`
      : `+880${phone.trim()}`;

    try {
      const regRes = await apiPost<{
        success: boolean;
        data?: { accessToken: string };
        error?: string;
      }>("/auth/register", {
        fullName: fullName.trim(),
        phone: formattedPhone,
        password: "OxygenCustomer2026!",
      });

      if (regRes.success && regRes.data?.accessToken) {
        localStorage.setItem("my_oxygen_token", regRes.data.accessToken);
        return regRes.data.accessToken;
      }
    } catch {
      // If user exists, attempt login with default pass
      try {
        const loginRes = await apiPost<{
          success: boolean;
          data?: { accessToken: string };
        }>("/auth/login", {
          identifier: formattedPhone,
          password: "OxygenCustomer2026!",
        });
        if (loginRes.success && loginRes.data?.accessToken) {
          localStorage.setItem("my_oxygen_token", loginRes.data.accessToken);
          return loginRes.data.accessToken;
        }
      } catch {
        // Continue, server will return 401 if strict
      }
    }
    return null;
  };

  const handlePlaceOrder = async () => {
    if (items.length === 0) {
      notifications.show({
        title: "Cart is empty",
        message: "Your cart is empty. Add products before placing an order.",
        color: "red",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await ensureAuthenticated();

      const normalizedPhone = phone.trim().startsWith("+88")
        ? phone.trim()
        : phone.trim().startsWith("0")
        ? phone.trim()
        : `0${phone.trim()}`;

      const payload = {
        shippingAddress: {
          fullName: fullName.trim(),
          phone: normalizedPhone,
          addressLine1: addressLine1.trim(),
          city: city.trim(),
          district: district.trim(),
          postalCode: postalCode.trim(),
        },
        items: items.map((i) => ({
          productId: i.id,
          quantity: i.quantity,
        })),
        paymentMethod: paymentMethod,
        couponCode: appliedCoupon?.code || undefined,
      };

      const res = await apiPost<{
        success: boolean;
        data?: {
          id: string;
          orderNumber: string;
          total: string | number;
          paymentStatus: string;
        };
        error?: string;
      }>("/orders/checkout", payload);

      if (res.success && res.data) {
        const orderNumber = res.data.orderNumber;
        clearCart();

        notifications.show({
          title: "Order Placed Successfully!",
          message: `Order #${orderNumber} has been received. Thank you!`,
          color: "teal",
          icon: <IconCheck size={16} />,
        });

        router.push(`/orders/${orderNumber}`);
      } else {
        throw new Error(res.error || "Failed to complete checkout.");
      }
    } catch (err: any) {
      notifications.show({
        title: "Checkout Error",
        message: err.message || "Something went wrong while processing your order.",
        color: "red",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) {
    return (
      <Box style={{ minHeight: "100vh" }}>
        <Navbar />
        <Footer />
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box style={{ minHeight: "100vh" }}>
        <Navbar />
        <Container size="sm" py="5rem">
          <Paper p="2.5rem" radius="lg" style={{ textAlign: "center", backgroundColor: "#FFFFFF" }}>
            <Box
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                backgroundColor: "#FFF0F3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: myOxygenColors.primaryPink,
                margin: "0 auto 16px",
              }}
            >
              <IconShoppingBag size={36} />
            </Box>
            <Title order={2} c={myOxygenColors.darkText} mb="xs">
              Your cart is empty
            </Title>
            <Text size="sm" c="dimmed" mb="xl">
              You haven&apos;t added any items to your shopping cart yet.
            </Text>
            <BrandButton
              component={Link}
              href="/products"
              variant="primary"
              size="md"
              radius="xl"
            >
              Start Shopping
            </BrandButton>
          </Paper>
        </Container>
        <Footer />
        <MobileBottomNav />
      </Box>
    );
  }

  return (
    <Box style={{ minHeight: "100vh", paddingBottom: 60 }}>
      <Navbar />

      <Container size="xl" py="2rem">
        <Title
          order={1}
          mb="xl"
          style={{
            fontFamily: "var(--font-poppins)",
            fontSize: "2rem",
            color: myOxygenColors.darkText,
          }}
        >
          Checkout
        </Title>

        {/* 3-Step Animated Stepper */}
        <Paper
          p="lg"
          radius="lg"
          mb="xl"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #F3F4F6",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
          }}
        >
          <Stepper
            active={activeStep}
            onStepClick={(step) => {
              if (step < activeStep) setActiveStep(step);
            }}
            color="primaryPink"
            size="sm"
          >
            <Stepper.Step
              label="Delivery Address"
              description="Where to ship"
              icon={<IconTruck size={18} />}
            />
            <Stepper.Step
              label="Payment Method"
              description="COD or Online"
              icon={<IconCreditCard size={18} />}
            />
            <Stepper.Step
              label="Review & Confirm"
              description="Final verification"
              icon={<IconChecklist size={18} />}
            />
          </Stepper>
        </Paper>

        <Grid gap="xl">
          {/* Main Stepper Step View */}
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Paper
              p="xl"
              radius="lg"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #F3F4F6",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
              }}
            >
              <AnimatePresence mode="wait">
                {/* STEP 1: SHIPPING ADDRESS */}
                {activeStep === 0 && (
                  <motion.div
                    key="step-1"
                    variants={fadeInUp}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <Title order={3} size="h4" c={myOxygenColors.darkText} mb="md">
                      1. Delivery Address (Bangladesh)
                    </Title>

                    <Stack gap="md">
                      <Grid gap="md">
                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <TextInput
                            label="Recipient Full Name"
                            placeholder="e.g. Nusrat Jahan"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.currentTarget.value)}
                            error={addressErrors.fullName}
                            radius="md"
                          />
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, sm: 6 }}>
                          <TextInput
                            label="Mobile Number (Active)"
                            placeholder="e.g. 01712345678"
                            required
                            description="For courier delivery confirmation"
                            value={phone}
                            onChange={(e) => setPhone(e.currentTarget.value)}
                            error={addressErrors.phone}
                            radius="md"
                          />
                        </Grid.Col>
                      </Grid>

                      <Textarea
                        label="Delivery Street Address"
                        placeholder="House / Apartment #, Road #, Sector / Area"
                        required
                        minRows={2}
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.currentTarget.value)}
                        error={addressErrors.addressLine1}
                        radius="md"
                      />

                      <Grid gap="md">
                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            label="City / Thana"
                            placeholder="e.g. Uttara / Dhanmondi"
                            required
                            value={city}
                            onChange={(e) => setCity(e.currentTarget.value)}
                            error={addressErrors.city}
                            radius="md"
                          />
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            label="District"
                            placeholder="e.g. Dhaka"
                            required
                            value={district}
                            onChange={(e) => setDistrict(e.currentTarget.value)}
                            error={addressErrors.district}
                            radius="md"
                          />
                        </Grid.Col>

                        <Grid.Col span={{ base: 12, sm: 4 }}>
                          <TextInput
                            label="Postal Code"
                            placeholder="e.g. 1205"
                            required
                            value={postalCode}
                            onChange={(e) => setPostalCode(e.currentTarget.value)}
                            error={addressErrors.postalCode}
                            radius="md"
                          />
                        </Grid.Col>
                      </Grid>

                      <Group justify="flex-end" mt="lg">
                        <BrandButton
                          variant="primary"
                          size="md"
                          radius="xl"
                          onClick={handleNextStep}
                          rightSection={<IconArrowRight size={18} />}
                        >
                          Continue to Payment
                        </BrandButton>
                      </Group>
                    </Stack>
                  </motion.div>
                )}

                {/* STEP 2: PAYMENT METHOD */}
                {activeStep === 1 && (
                  <motion.div
                    key="step-2"
                    variants={fadeInUp}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <Title order={3} size="h4" c={myOxygenColors.darkText} mb="md">
                      2. Choose Payment Method
                    </Title>

                    <Stack gap="md">
                      {/* Cash on Delivery Option */}
                      <Paper
                        p="md"
                        radius="lg"
                        onClick={() => setPaymentMethod("CASH_ON_DELIVERY")}
                        style={{
                          cursor: "pointer",
                          backgroundColor:
                            paymentMethod === "CASH_ON_DELIVERY" ? "#FFF0F3" : "#FFFFFF",
                          border: `2px solid ${
                            paymentMethod === "CASH_ON_DELIVERY"
                              ? myOxygenColors.primaryPink
                              : "#E5E7EB"
                          }`,
                          transition: "all 0.2s ease",
                        }}
                      >
                        <Group justify="space-between" align="center">
                          <Group gap="md">
                            <Box
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                backgroundColor: "#E8F8F0",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#2C7A52",
                              }}
                            >
                              <IconCash size={24} />
                            </Box>
                            <Box>
                              <Text fw={700} size="sm" c={myOxygenColors.darkText}>
                                Cash on Delivery (COD)
                              </Text>
                              <Text size="xs" c="dimmed">
                                Pay with cash when the courier hands over your parcel.
                              </Text>
                            </Box>
                          </Group>

                          <Radio
                            checked={paymentMethod === "CASH_ON_DELIVERY"}
                            onChange={() => setPaymentMethod("CASH_ON_DELIVERY")}
                            color="primaryPink"
                          />
                        </Group>
                      </Paper>

                      {/* Online Payment Option */}
                      <Paper
                        p="md"
                        radius="lg"
                        onClick={() => setPaymentMethod("ONLINE_GATEWAY")}
                        style={{
                          cursor: "pointer",
                          backgroundColor:
                            paymentMethod === "ONLINE_GATEWAY" ? "#FFF0F3" : "#FFFFFF",
                          border: `2px solid ${
                            paymentMethod === "ONLINE_GATEWAY"
                              ? myOxygenColors.primaryPink
                              : "#E5E7EB"
                          }`,
                          transition: "all 0.2s ease",
                        }}
                      >
                        <Group justify="space-between" align="center">
                          <Group gap="md">
                            <Box
                              style={{
                                width: 44,
                                height: 44,
                                borderRadius: 10,
                                backgroundColor: "#EDE9FE",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "#7C3AED",
                              }}
                            >
                              <IconDeviceMobile size={24} />
                            </Box>
                            <Box>
                              <Text fw={700} size="sm" c={myOxygenColors.darkText}>
                                Online Gateway (bKash / Nagad / Cards)
                              </Text>
                              <Text size="xs" c="dimmed">
                                Fast, secure instant payment via mobile banking or Visa/Mastercard.
                              </Text>
                            </Box>
                          </Group>

                          <Radio
                            checked={paymentMethod === "ONLINE_GATEWAY"}
                            onChange={() => setPaymentMethod("ONLINE_GATEWAY")}
                            color="primaryPink"
                          />
                        </Group>
                      </Paper>

                      <Group justify="space-between" mt="lg">
                        <Button
                          variant="subtle"
                          color="gray"
                          radius="xl"
                          onClick={handlePrevStep}
                          leftSection={<IconArrowLeft size={16} />}
                        >
                          Back to Address
                        </Button>

                        <BrandButton
                          variant="primary"
                          size="md"
                          radius="xl"
                          onClick={handleNextStep}
                          rightSection={<IconArrowRight size={18} />}
                        >
                          Review Order
                        </BrandButton>
                      </Group>
                    </Stack>
                  </motion.div>
                )}

                {/* STEP 3: REVIEW & PLACE ORDER */}
                {activeStep === 2 && (
                  <motion.div
                    key="step-3"
                    variants={fadeInUp}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <Title order={3} size="h4" c={myOxygenColors.darkText} mb="md">
                      3. Review & Place Order
                    </Title>

                    <Stack gap="lg">
                      {/* Shipping summary card */}
                      <Paper p="md" radius="md" style={{ backgroundColor: "#F9FAFB" }}>
                        <Group justify="space-between" mb="xs">
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Shipping Destination
                          </Text>
                          <Button
                            variant="subtle"
                            color="primaryPink"
                            size="compact-xs"
                            onClick={() => setActiveStep(0)}
                          >
                            Edit
                          </Button>
                        </Group>
                        <Text size="sm" fw={700} c={myOxygenColors.darkText}>
                          {fullName} ({phone})
                        </Text>
                        <Text size="xs" c="dimmed">
                          {addressLine1}, {city}, {district} - {postalCode}
                        </Text>
                      </Paper>

                      {/* Payment method summary card */}
                      <Paper p="md" radius="md" style={{ backgroundColor: "#F9FAFB" }}>
                        <Group justify="space-between" mb="xs">
                          <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                            Payment Method
                          </Text>
                          <Button
                            variant="subtle"
                            color="primaryPink"
                            size="compact-xs"
                            onClick={() => setActiveStep(1)}
                          >
                            Edit
                          </Button>
                        </Group>
                        <Text size="sm" fw={700} c={myOxygenColors.darkText}>
                          {paymentMethod === "CASH_ON_DELIVERY"
                            ? "Cash on Delivery (COD)"
                            : "Online Gateway (bKash / Nagad / Cards)"}
                        </Text>
                      </Paper>

                      {/* Items list */}
                      <Box>
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb="xs">
                          Items to dispatch ({items.length})
                        </Text>
                        <Stack gap="sm">
                          {items.map((item) => (
                            <Group key={item.id} justify="space-between" align="center">
                              <Group gap="sm">
                                <Box
                                  style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 6,
                                    overflow: "hidden",
                                    backgroundColor: "#F9FAFB",
                                  }}
                                >
                                  <Image
                                    src={item.image}
                                    alt={item.title}
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                  />
                                </Box>
                                <Box>
                                  <Text size="xs" fw={600} lineClamp={1} maw={250}>
                                    {item.title}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    Qty: {item.quantity} × ৳{item.unitPrice.toLocaleString()}
                                  </Text>
                                </Box>
                              </Group>
                              <Text size="sm" fw={700} c={myOxygenColors.darkText}>
                                ৳ {(item.unitPrice * item.quantity).toLocaleString()}
                              </Text>
                            </Group>
                          ))}
                        </Stack>
                      </Box>

                      {/* Trust guarantee banner */}
                      <Alert
                        icon={<IconShieldCheck size={20} color="#2C7A52" />}
                        title="My Oxygen Quality Guarantee"
                        styles={{
                          root: {
                            backgroundColor: "#E8F8F0",
                            border: "1px solid #4CAF7D",
                            borderRadius: 10,
                          },
                          title: { color: "#205B3D", fontWeight: 700 },
                          message: { color: "#2C7A52", fontSize: 13 },
                        }}
                      >
                        All items are guaranteed authentic with verified FEFO batch allocations.
                      </Alert>

                      <Group justify="space-between" mt="md">
                        <Button
                          variant="subtle"
                          color="gray"
                          radius="xl"
                          onClick={handlePrevStep}
                          leftSection={<IconArrowLeft size={16} />}
                        >
                          Back to Payment
                        </Button>

                        <BrandButton
                          variant="primary"
                          size="lg"
                          radius="xl"
                          loading={isSubmitting}
                          onClick={handlePlaceOrder}
                          rightSection={<IconCheck size={20} />}
                        >
                          Place Order (৳{finalTotal.toLocaleString()})
                        </BrandButton>
                      </Group>
                    </Stack>
                  </motion.div>
                )}
              </AnimatePresence>
            </Paper>
          </Grid.Col>

          {/* Right Column: Order Summary Card */}
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Paper
              p="lg"
              radius="lg"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #F3F4F6",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
                position: "sticky",
                top: 90,
              }}
            >
              <Title order={3} size="h5" c={myOxygenColors.darkText} mb="md">
                Order Summary
              </Title>

              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)
                  </Text>
                  <Text size="sm" fw={600} c={myOxygenColors.darkText}>
                    ৳ {subtotal.toLocaleString()}
                  </Text>
                </Group>

                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    Delivery Fee
                  </Text>
                  <Text
                    size="sm"
                    fw={600}
                    c={shippingFee === 0 ? "teal" : myOxygenColors.darkText}
                  >
                    {shippingFee === 0 ? "FREE" : `৳ ${shippingFee}`}
                  </Text>
                </Group>

                {appliedCoupon && (
                  <Group justify="space-between">
                    <Text size="sm" c="teal" fw={600}>
                      Coupon ({appliedCoupon.code})
                    </Text>
                    <Text size="sm" fw={700} c="teal">
                      -৳ {appliedCoupon.discountAmount.toLocaleString()}
                    </Text>
                  </Group>
                )}

                <Divider my="sm" />

                <Group justify="space-between">
                  <Text size="md" fw={700} c={myOxygenColors.darkText}>
                    Total Amount
                  </Text>
                  <Text size="xl" fw={800} c={myOxygenColors.primaryPink}>
                    ৳ {finalTotal.toLocaleString()}
                  </Text>
                </Group>
              </Stack>
            </Paper>
          </Grid.Col>
        </Grid>
      </Container>

      <Footer />
      <MobileBottomNav />
    </Box>
  );
}

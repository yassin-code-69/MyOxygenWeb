import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import * as bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db, users } from "../db";
import { registerSchema, loginSchema, refreshTokenSchema } from "./auth.schema";
import { signAccessToken, signRefreshToken, verifyToken } from "../lib/jwt";
import { requireAuth, type AuthContext } from "../middleware/auth";

export const authRoutes = new Hono<AuthContext>();

// User Registration
authRoutes.post("/register", zValidator("json", registerSchema), async (c) => {
  const { fullName, phone, email, password } = c.req.valid("json");

  // Check unique constraints
  const conditions = [eq(users.phone, phone)];
  if (email) {
    conditions.push(eq(users.email, email));
  }
  const existingUser = await db.query.users.findFirst({
    where: or(...conditions),
  });

  if (existingUser) {
    return c.json(
      { success: false, error: "User with this phone or email already exists" },
      409,
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [newUser] = await db
    .insert(users)
    .values({
      fullName,
      phone,
      email: email || null,
      passwordHash,
      role: "CUSTOMER",
    })
    .returning({
      id: users.id,
      fullName: users.fullName,
      phone: users.phone,
      email: users.email,
      role: users.role,
    });

  const accessToken = await signAccessToken({
    sub: newUser.id,
    role: newUser.role,
    phone: newUser.phone,
    email: newUser.email || undefined,
  });
  const refreshToken = await signRefreshToken(newUser.id);

  return c.json(
    {
      success: true,
      data: { user: newUser, accessToken, refreshToken },
    },
    201,
  );
});

// User & Admin Login
authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const { identifier, password } = c.req.valid("json");

  // Lookup user by phone or email
  const user = await db.query.users.findFirst({
    where: or(eq(users.phone, identifier), eq(users.email, identifier)),
  });

  if (!user || !user.passwordHash || !user.isActive) {
    return c.json(
      { success: false, error: "Invalid credentials or inactive account" },
      401,
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return c.json({ success: false, error: "Invalid credentials" }, 401);
  }

  const accessToken = await signAccessToken({
    sub: user.id,
    role: user.role,
    phone: user.phone,
    email: user.email || undefined,
  });
  const refreshToken = await signRefreshToken(user.id);

  return c.json({
    success: true,
    data: {
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
      accessToken,
      refreshToken,
    },
  });
});

// Refresh Access Token
authRoutes.post(
  "/refresh",
  zValidator("json", refreshTokenSchema),
  async (c) => {
    const { refreshToken } = c.req.valid("json");

    try {
      const payload = await verifyToken(refreshToken);
      const user = await db.query.users.findFirst({
        where: eq(users.id, payload.sub as string),
      });

      if (!user || !user.isActive) {
        return c.json({ success: false, error: "Invalid user session" }, 401);
      }

      const newAccessToken = await signAccessToken({
        sub: user.id,
        role: user.role,
        phone: user.phone,
        email: user.email || undefined,
      });

      return c.json({ success: true, data: { accessToken: newAccessToken } });
    } catch {
      return c.json(
        { success: false, error: "Invalid or expired refresh token" },
        401,
      );
    }
  },
);

// Authenticated User Identity Probe
authRoutes.get("/me", requireAuth, async (c) => {
  const userPayload = c.get("user");
  const user = await db.query.users.findFirst({
    where: eq(users.id, userPayload.sub),
    columns: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  if (!user) {
    return c.json({ success: false, error: "User not found" }, 404);
  }

  return c.json({ success: true, data: user });
});

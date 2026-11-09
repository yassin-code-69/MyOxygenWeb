import { Hono } from "hono";
import { created, ok } from "../lib/http";
import { validate } from "../lib/validation";
import { requireAuth, type AuthContext } from "../middleware/auth";
import { authService } from "../services/auth.service";
import { loginSchema, refreshTokenSchema, registerSchema } from "./auth.schema";

export const authRoutes = new Hono<AuthContext>();

/** POST /auth/register — create a CUSTOMER account and sign in. */
authRoutes.post("/register", validate("json", registerSchema), async (c) => {
  const result = await authService.register(c.req.valid("json"));
  return created(c, result);
});

/** POST /auth/login — phone or email + password. */
authRoutes.post("/login", validate("json", loginSchema), async (c) => {
  const result = await authService.login(c.req.valid("json"));
  return ok(c, result);
});

/** POST /auth/refresh — exchange a refresh token for a new access token. */
authRoutes.post("/refresh", validate("json", refreshTokenSchema), async (c) => {
  const { refreshToken } = c.req.valid("json");
  return ok(c, await authService.refresh(refreshToken));
});

/** GET /auth/me — profile of the authenticated caller. */
authRoutes.get("/me", requireAuth, async (c) => {
  return ok(c, await authService.getProfile(c.get("user").sub));
});

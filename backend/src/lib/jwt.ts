import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import { env } from "../env";
import { USER_ROLES, type UserRole } from "../types";

const SECRET = new TextEncoder().encode(env.JWT_SECRET);
const ALGORITHM = "HS256";
const ISSUER = "my-oxygen-api";
const AUDIENCE = "my-oxygen";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

export type TokenType = "access" | "refresh";

export interface UserTokenPayload extends JWTPayload {
  sub: string;
  role: UserRole;
  email?: string;
  phone: string;
  tokenType: "access";
}

export interface RefreshTokenPayload extends JWTPayload {
  sub: string;
  tokenType: "refresh";
}

export type AccessTokenClaims = Pick<UserTokenPayload, "sub" | "role" | "email" | "phone">;

const accessClaimsSchema = z.object({
  sub: z.string().uuid(),
  role: z.enum(USER_ROLES),
  email: z.string().optional(),
  phone: z.string(),
  tokenType: z.literal("access"),
});

const refreshClaimsSchema = z.object({
  sub: z.string().uuid(),
  tokenType: z.literal("refresh"),
});

export class InvalidTokenError extends Error {
  constructor(message = "Invalid or expired token") {
    super(message);
    this.name = "InvalidTokenError";
  }
}

export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  const payload: Record<string, string> = {
    role: claims.role,
    phone: claims.phone,
    tokenType: "access",
  };
  if (claims.email) payload.email = claims.email;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(SECRET);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ tokenType: "refresh" })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(SECRET);
}

async function verifySignature(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return payload;
  } catch {
    throw new InvalidTokenError();
  }
}

/** Verifies signature, expiry and claims of an ACCESS token. Throws `InvalidTokenError`. */
export async function verifyAccessToken(token: string): Promise<UserTokenPayload> {
  const payload = await verifySignature(token);
  const parsed = accessClaimsSchema.safeParse(payload);
  if (!parsed.success) {
    throw new InvalidTokenError("Access token required");
  }
  return { ...payload, ...parsed.data };
}

/** Verifies signature, expiry and claims of a REFRESH token. Throws `InvalidTokenError`. */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const payload = await verifySignature(token);
  const parsed = refreshClaimsSchema.safeParse(payload);
  if (!parsed.success) {
    throw new InvalidTokenError("Refresh token required");
  }
  return { ...payload, ...parsed.data };
}

/**
 * Verifies signature/expiry only and returns the raw claims. Prefer the
 * typed `verifyAccessToken` / `verifyRefreshToken`.
 */
export async function verifyToken(token: string): Promise<JWTPayload & { tokenType?: TokenType }> {
  const payload = await verifySignature(token);
  const tokenType = payload.tokenType;
  return {
    ...payload,
    tokenType: tokenType === "access" || tokenType === "refresh" ? tokenType : undefined,
  };
}

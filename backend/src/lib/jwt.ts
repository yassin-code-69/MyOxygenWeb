import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "../env";

const SECRET = new TextEncoder().encode(env.JWT_SECRET);
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

export interface UserTokenPayload extends JWTPayload {
  sub: string;
  role: string;
  email?: string;
  phone: string;
  tokenType?: "access" | "refresh";
}

export async function signAccessToken(
  payload: Omit<UserTokenPayload, "exp" | "iat">,
): Promise<string> {
  return new SignJWT({ ...payload, tokenType: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(SECRET);
}

export async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, tokenType: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<UserTokenPayload> {
  const { payload } = await jwtVerify(token, SECRET, {
    algorithms: ["HS256"],
  });
  return payload as UserTokenPayload;
}

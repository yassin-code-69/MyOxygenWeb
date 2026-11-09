import { randomUUID } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { eq, or } from "drizzle-orm";
import { db as defaultDb, type DatabaseClient } from "../db/client";
import { users } from "../db/schema/tables";
import { isUniqueViolation } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import {
  InvalidTokenError,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";
import type { LoginInput, RegisterInput } from "../routes/auth.schema";
import type { UserRole } from "../types";
import { normalizeBangladeshMobile } from "./phone";

export const BCRYPT_ROUNDS = 10;
const INVALID_CREDENTIALS = "Invalid credentials";

/**
 * Hash of a random throwaway password, compared against when the account does
 * not exist (or has no password) so that response timing does not reveal
 * which identifiers are registered.
 */
const dummyHashPromise: Promise<string> = bcrypt.hash(randomUUID(), BCRYPT_ROUNDS);

export interface PublicUser {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: PublicUser;
}

export interface UserProfile extends PublicUser {
  createdAt: Date;
}

const publicColumns = {
  id: users.id,
  fullName: users.fullName,
  phone: users.phone,
  email: users.email,
  role: users.role,
} as const;

/** Emails are stored lower-case (enforced by a CHECK constraint). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function issueTokens(user: PublicUser): Promise<AuthTokens> {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({
      sub: user.id,
      role: user.role,
      phone: user.phone,
      email: user.email ?? undefined,
    }),
    signRefreshToken(user.id),
  ]);
  return { accessToken, refreshToken };
}

export class AuthService {
  constructor(private readonly db: DatabaseClient = defaultDb) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    const email = input.email ? normalizeEmail(input.email) : null;
    // Already canonical (01XXXXXXXXX): registerSchema normalises the number.
    const phone = input.phone;

    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(email ? or(eq(users.phone, phone), eq(users.email, email)) : eq(users.phone, phone))
      .limit(1);
    if (existing.length > 0) {
      throw AppError.conflict("User with this phone or email already exists");
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    let created: PublicUser | undefined;
    try {
      [created] = await this.db
        .insert(users)
        .values({ fullName: input.fullName.trim(), phone, email, passwordHash, role: "CUSTOMER" })
        .returning(publicColumns);
    } catch (error) {
      // Lost a race with a concurrent registration for the same phone/email.
      if (isUniqueViolation(error)) {
        throw AppError.conflict("User with this phone or email already exists");
      }
      throw error;
    }
    if (!created) {
      throw AppError.internal("User could not be created");
    }

    return { user: created, ...(await issueTokens(created)) };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const identifier = input.identifier.trim();
    // Phones are stored as 01XXXXXXXXX, so 01…, 880…, +880… (with spaces or dashes) all match.
    const condition = identifier.includes("@")
      ? eq(users.email, normalizeEmail(identifier))
      : eq(users.phone, normalizeBangladeshMobile(identifier) ?? identifier);

    const [account] = await this.db
      .select({ ...publicColumns, passwordHash: users.passwordHash, isActive: users.isActive })
      .from(users)
      .where(condition)
      .limit(1);

    // Always run exactly one bcrypt comparison so unknown accounts take as long as known ones.
    const hashToCheck = account?.passwordHash ?? (await dummyHashPromise);
    const passwordMatches = await bcrypt.compare(input.password, hashToCheck);

    if (!account || !account.passwordHash || !account.isActive || !passwordMatches) {
      throw AppError.unauthorized(INVALID_CREDENTIALS);
    }

    const user: PublicUser = {
      id: account.id,
      fullName: account.fullName,
      phone: account.phone,
      email: account.email,
      role: account.role,
    };
    return { user, ...(await issueTokens(user)) };
  }

  /** Exchanges a REFRESH token for a new access token. Access tokens are rejected. */
  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    let userId: string;
    try {
      userId = (await verifyRefreshToken(refreshToken)).sub;
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        throw AppError.unauthorized("Invalid or expired refresh token");
      }
      throw error;
    }

    const [account] = await this.db
      .select({ ...publicColumns, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!account || !account.isActive) {
      throw AppError.unauthorized("Invalid or expired refresh token");
    }

    const accessToken = await signAccessToken({
      sub: account.id,
      role: account.role,
      phone: account.phone,
      email: account.email ?? undefined,
    });
    return { accessToken };
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const [profile] = await this.db
      .select({ ...publicColumns, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!profile) {
      throw AppError.notFound("User");
    }
    return profile;
  }
}

export const authService = new AuthService();

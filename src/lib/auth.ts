import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  // Fail loudly at startup rather than silently signing tokens with "undefined".
  throw new Error("JWT_SECRET is not set in environment variables");
}

const JWT_EXPIRES_IN = "7d";
export const AUTH_COOKIE_NAME = "exam_processor_token";

export type JwtPayload = {
  userId: string;
  email: string;
  role: "INSTRUCTOR" | "STUDENT";
};

// bcrypt.hash "salts" the password (adds random data before hashing) so that
// two users with the same password get different hashes in the database.
// The `10` is the "cost factor" — higher is slower but harder to brute-force.
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, 10);
}

export async function verifyPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

// A JWT is a signed token: { userId, email, role } + an expiry, signed with
// our secret. Anyone can *read* it, but only our server (which holds the
// secret) can produce one that verifies correctly — so it can't be forged.
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET as string, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET as string) as JwtPayload;
  } catch {
    // Covers: expired token, tampered token, malformed token.
    return null;
  }
}

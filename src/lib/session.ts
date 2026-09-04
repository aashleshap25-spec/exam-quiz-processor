import { cookies } from "next/headers";
import { verifyToken, AUTH_COOKIE_NAME, JwtPayload } from "@/lib/auth";

// This only reads the JWT payload — it does NOT hit the database.
// Good enough for "is someone logged in and what's their id/role"
// on every request without an extra DB round trip. Use getCurrentUserFromDb()
// below when you need fresh fields (like a changed name).
export function getSessionPayload(): JwtPayload | null {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

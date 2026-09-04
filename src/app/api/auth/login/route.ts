import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken, AUTH_COOKIE_NAME } from "@/lib/auth";
import { loginSchema } from "@/lib/validation/authSchemas";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Deliberately vague error message — don't reveal whether the email
  // exists or the password was wrong. This prevents attackers from using
  // the login form to discover which emails are registered.
  const invalidCredentials = () => {
    logger.warn("auth_login_failed", { email });
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  };

  if (!user) return invalidCredentials();

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) return invalidCredentials();

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  logger.info("auth_login_succeeded", { userId: user.id });

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });

  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}

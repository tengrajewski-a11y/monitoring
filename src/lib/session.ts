import { SignJWT, jwtVerify } from "jose";
import type { UserRole } from "../generated/prisma/client";

export const SESSION_COOKIE = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 dni

export type SessionPayload = {
  sub: string; // id użytkownika
  email: string;
  name: string | null;
  role: UserRole;
};

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Brak zmiennej środowiskowej AUTH_SECRET — wymagana do logowania. " +
        "Wygeneruj losowy ciąg (np. `openssl rand -base64 32`) i ustaw ją w .env / w Vercelu.",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return {
      sub: payload.sub,
      email: payload.email as string,
      name: (payload.name as string | null) ?? null,
      role: payload.role as UserRole,
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_MAX_AGE = SESSION_DURATION_SECONDS;

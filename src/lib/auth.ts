import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "./session";

/** Zwraca zalogowanego użytkownika (z tokenu sesji) albo null, jeśli nikt nie jest zalogowany. */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireUser(): Promise<SessionPayload> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Brak zalogowanego użytkownika.");
  return user;
}

/** Zespół agencji (AGENCY/ADMIN) — wyklucza rolę CLIENT, np. dla operacji edycyjnych. */
export async function requireStaff(): Promise<SessionPayload> {
  const user = await requireUser();
  if (user.role === "CLIENT") throw new Error("Brak uprawnień.");
  return user;
}

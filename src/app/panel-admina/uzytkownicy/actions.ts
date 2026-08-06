"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import type { UserRole } from "@/generated/prisma/client";

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Brak uprawnień administratora.");
  }
  return user;
}

function generatePassword(): string {
  // 12 znaków, alfanumeryczne — czytelne do ręcznego przepisania.
  return crypto.randomBytes(9).toString("base64url").slice(0, 12);
}

export type CreateUserState = {
  error?: string;
  success?: { email: string; password: string };
};

export async function createUser(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  await assertAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "AGENCY") as UserRole;
  const clientId = String(formData.get("clientId") ?? "") || null;

  if (!email) return { error: "Podaj adres e-mail." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Użytkownik z tym adresem e-mail już istnieje." };

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: {
      email,
      name: name || null,
      role,
      clientId: role === "CLIENT" ? clientId : null,
      passwordHash,
    },
  });

  revalidatePath("/panel-admina/uzytkownicy");
  return { success: { email, password } };
}

export async function toggleUserActive(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return;
  await prisma.user.update({ where: { id }, data: { active: !user.active } });
  revalidatePath("/panel-admina/uzytkownicy");
}

export async function updateUserRole(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const role = String(formData.get("role")) as UserRole;
  const clientId = String(formData.get("clientId") ?? "") || null;
  await prisma.user.update({
    where: { id },
    data: { role, clientId: role === "CLIENT" ? clientId : null },
  });
  revalidatePath("/panel-admina/uzytkownicy");
}

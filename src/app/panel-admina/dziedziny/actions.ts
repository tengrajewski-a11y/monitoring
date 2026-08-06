"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Brak uprawnień administratora.");
  }
}

export async function updateDomain(formData: FormData) {
  await assertAdmin();

  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const color = String(formData.get("color") ?? "#111111").trim();

  if (!name) return;

  await prisma.domain.update({
    where: { id },
    data: { name, description: description || null, color },
  });
  revalidatePath("/panel-admina/dziedziny");
  revalidatePath("/dziedziny");
}

export async function toggleDomainActive(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const domain = await prisma.domain.findUnique({ where: { id } });
  if (!domain) return;
  await prisma.domain.update({ where: { id }, data: { active: !domain.active } });
  revalidatePath("/panel-admina/dziedziny");
  revalidatePath("/dziedziny");
}

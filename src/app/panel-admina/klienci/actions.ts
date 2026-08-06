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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export type CreateClientState = { error?: string };

export async function createClient(
  _prevState: CreateClientState,
  formData: FormData,
): Promise<CreateClientState> {
  await assertAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Podaj nazwę klienta." };

  const baseSlug = slugify(name) || "klient";
  let slug = baseSlug;
  let i = 1;
  while (await prisma.client.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${++i}`;
  }

  await prisma.client.create({ data: { name, slug } });
  revalidatePath("/panel-admina/klienci");
  return {};
}

export async function toggleClientActive(formData: FormData) {
  await assertAdmin();
  const id = String(formData.get("id"));
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return;
  await prisma.client.update({ where: { id }, data: { active: !client.active } });
  revalidatePath("/panel-admina/klienci");
}

export async function updateClientDomains(formData: FormData) {
  await assertAdmin();
  const clientId = String(formData.get("clientId"));
  const domainIds = formData.getAll("domainIds").map(String);

  await prisma.clientDomain.deleteMany({ where: { clientId } });
  if (domainIds.length > 0) {
    await prisma.clientDomain.createMany({
      data: domainIds.map((domainId) => ({ clientId, domainId })),
    });
  }
  revalidatePath("/panel-admina/klienci");
}

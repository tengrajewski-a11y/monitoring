import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { DOMAINS } from "../src/lib/domains";
import { ingestAll } from "../src/lib/ingest";

async function seedDomains() {
  for (const d of DOMAINS) {
    const domain = await prisma.domain.upsert({
      where: { slug: d.slug },
      create: {
        slug: d.slug,
        name: d.name,
        description: d.description,
        color: d.color,
        icon: d.icon,
        order: d.order,
      },
      update: {
        name: d.name,
        description: d.description,
        color: d.color,
        icon: d.icon,
        order: d.order,
      },
    });

    await prisma.domainKeyword.deleteMany({ where: { domainId: domain.id } });
    await prisma.domainKeyword.createMany({
      data: d.keywords.map((term) => ({ domainId: domain.id, term })),
    });
  }
  console.log(`Zseedowano ${DOMAINS.length} dziedzin.`);
}

async function seedDemoClient() {
  const client = await prisma.client.upsert({
    where: { slug: "trinity-trust-demo" },
    create: { name: "Klient demonstracyjny", slug: "trinity-trust-demo" },
    update: {},
  });

  const domains = await prisma.domain.findMany();
  for (const domain of domains) {
    await prisma.clientDomain.upsert({
      where: { clientId_domainId: { clientId: client.id, domainId: domain.id } },
      create: { clientId: client.id, domainId: domain.id },
      update: {},
    });
  }
  console.log("Zseedowano klienta demonstracyjnego.");
}

async function seedAdminUser() {
  const email = (process.env.ADMIN_EMAIL || "admin@trinity-trust.pl").toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Konto administratora już istnieje (${email}) — pomijam.`);
    return;
  }

  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url").slice(0, 12);
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: { email, name: "Administrator", role: "ADMIN", passwordHash },
  });

  console.log("═══════════════════════════════════════════════════════");
  console.log("  Utworzono konto administratora — zaloguj się na /login:");
  console.log(`  E-mail:  ${email}`);
  console.log(`  Hasło:   ${password}`);
  console.log("  (zapisz to hasło teraz — nie da się go później podejrzeć)");
  console.log("═══════════════════════════════════════════════════════");
}

async function main() {
  await seedDomains();
  await seedDemoClient();
  await seedAdminUser();

  console.log("Uruchamiam import danych ze źródeł (Sejm, RCL, EUR-Lex, komisje)...");
  const { results, komisje } = await ingestAll();
  for (const r of results) {
    console.log(
      `  ${r.source}: ${r.items.length} pozycji (${r.isFallback ? "dane przykładowe — brak połączenia z API" : "dane na żywo"})`,
    );
  }
  console.log(
    `  KOMISJE: ${komisje.committees} komisji, ${komisje.sittings} posiedzeń (${komisje.isFallback ? "dane przykładowe — brak połączenia z API" : "dane na żywo"})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

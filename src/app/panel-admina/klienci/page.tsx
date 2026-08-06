import { prisma } from "@/lib/db";
import { CreateClientForm } from "@/components/admin/CreateClientForm";
import { ClientCard } from "@/components/admin/ClientCard";

export const dynamic = "force-dynamic";

export default async function KlienciPage() {
  const [clients, domains] = await Promise.all([
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: { domains: { select: { domainId: true } } },
    }),
    prisma.domain.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <CreateClientForm />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {clients.map((client) => (
          <ClientCard
            key={client.id}
            client={{
              id: client.id,
              name: client.name,
              active: client.active,
              domainIds: client.domains.map((d) => d.domainId),
            }}
            domains={domains}
          />
        ))}
        {clients.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
            Brak klientów — dodaj pierwszego powyżej.
          </p>
        )}
      </div>
    </div>
  );
}

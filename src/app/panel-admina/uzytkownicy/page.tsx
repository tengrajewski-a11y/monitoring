import { prisma } from "@/lib/db";
import { CreateUserForm } from "@/components/admin/CreateUserForm";
import { UserRow } from "@/components/admin/UserRow";

export const dynamic = "force-dynamic";

export default async function UzytkownicyPage() {
  const [users, clients] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <CreateUserForm clients={clients} />

      <div className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
          Wszyscy użytkownicy ({users.length})
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4 font-medium">Użytkownik</th>
                <th className="pb-2 pr-4 font-medium">Rola</th>
                <th className="pb-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={{
                    id: u.id,
                    email: u.email,
                    name: u.name,
                    role: u.role,
                    clientId: u.clientId,
                    active: u.active,
                  }}
                  clients={clients}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

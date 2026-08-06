import { prisma } from "@/lib/db";
import { updateDomain, toggleDomainActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function DziedzinyAdminPage() {
  const domains = await prisma.domain.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { items: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Słowa kluczowe (klasyfikacja dokumentów) edytuje się w kodzie —{" "}
        <code className="rounded bg-black/[.04] px-1 py-0.5 text-xs">
          src/lib/domains.ts
        </code>
        . Poniżej zmienisz nazwę, opis, kolor i widoczność dziedziny.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {domains.map((domain) => (
          <div key={domain.id} className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">
                {domain._count.items} pozycji · {domain.active ? "widoczna" : "ukryta"}
              </span>
              <form action={toggleDomainActive}>
                <input type="hidden" name="id" value={domain.id} />
                <button
                  type="submit"
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    domain.active
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-zinc-200 bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {domain.active ? "Widoczna" : "Ukryta"}
                </button>
              </form>
            </div>

            <form action={updateDomain} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="id" value={domain.id} />
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Nazwa
                </label>
                <input
                  name="name"
                  defaultValue={domain.name}
                  required
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Opis
                </label>
                <textarea
                  name="description"
                  defaultValue={domain.description ?? ""}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium uppercase tracking-wide text-muted">
                  Kolor
                </label>
                <input
                  name="color"
                  type="color"
                  defaultValue={domain.color}
                  className="h-8 w-12 rounded border border-border bg-background"
                />
                <button
                  type="submit"
                  className="ml-auto rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-foreground/40 hover:text-foreground"
                >
                  Zapisz
                </button>
              </div>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}

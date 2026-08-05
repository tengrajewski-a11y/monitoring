import { Suspense } from "react";
import { getDomains, getItems } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { FilterBar } from "@/components/FilterBar";
import type { ItemStatus, SourceType } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  dziedzina?: string;
  zrodlo?: string;
  status?: string;
  q?: string;
}>;

export default async function MonitoringPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const domains = await getDomains();

  const items = await getItems(
    {
      domainSlug: sp.dziedzina || undefined,
      source: (sp.zrodlo as SourceType) || undefined,
      status: (sp.status as ItemStatus) || undefined,
      q: sp.q || undefined,
    },
    100,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Monitoring legislacyjny
        </p>
        <h1 className="mt-2 font-brand text-2xl text-foreground sm:text-3xl">
          Wszystkie pozycje
        </h1>
      </div>

      <Suspense>
        <FilterBar domains={domains} />
      </Suspense>

      <p className="text-sm text-muted">
        {items.length} {items.length === 1 ? "pozycja" : "pozycji"}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} />
        ))}
        {items.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
            Brak pozycji spełniających wybrane kryteria.
          </p>
        )}
      </div>
    </div>
  );
}

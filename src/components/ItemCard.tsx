import Link from "next/link";
import { StatusBadge, SourceBadge, DomainTag, FallbackNotice } from "./badges";
import type { MonitoringItem, Domain } from "../generated/prisma/client";

type ItemWithDomains = MonitoringItem & { domains: { domain: Domain }[] };

export function ItemCard({ item }: { item: ItemWithDomains }) {
  return (
    <Link
      href={`/monitoring/${item.id}`}
      className="group block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-foreground/30 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SourceBadge source={item.source} />
        <StatusBadge status={item.status} />
        {item.isFallback && <FallbackNotice />}
        {item.documentDate && (
          <span className="ml-auto text-xs text-muted">
            {new Date(item.documentDate).toLocaleDateString("pl-PL")}
          </span>
        )}
      </div>

      <h3 className="mt-3 text-[0.95rem] font-medium leading-snug text-foreground group-hover:underline">
        {item.title}
      </h3>

      {item.stage && (
        <p className="mt-1.5 text-sm text-muted">{item.stage}</p>
      )}

      {item.domains.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.domains.map(({ domain }) => (
            <DomainTag key={domain.id} name={domain.name} color={domain.color} />
          ))}
        </div>
      )}
    </Link>
  );
}

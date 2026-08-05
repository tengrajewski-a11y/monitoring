import Link from "next/link";
import { getDomains, getRecentEvents } from "@/lib/queries";
import { SourceBadge, StatusBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ dziedzina?: string }>;

export default async function AlertyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const [domains, events] = await Promise.all([
    getDomains(),
    getRecentEvents({ domainSlug: sp.dziedzina || undefined }, 80),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Alerty
        </p>
        <h1 className="mt-2 font-brand text-2xl text-foreground sm:text-3xl">
          Zmiany i nowe pozycje
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Chronologiczny zapis nowych pozycji oraz zmian statusu/etapu
          wykrytych przy kolejnych odświeżeniach danych.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/alerty"
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            !sp.dziedzina
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted hover:border-foreground/40"
          }`}
        >
          Wszystkie dziedziny
        </Link>
        {domains.map((d) => (
          <Link
            key={d.slug}
            href={`/alerty?dziedzina=${d.slug}`}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={
              sp.dziedzina === d.slug
                ? { background: d.color, borderColor: d.color, color: "#fff" }
                : { borderColor: "var(--border)", color: "var(--muted)" }
            }
          >
            {d.name}
          </Link>
        ))}
      </div>

      <ol className="flex flex-col gap-3 border-l border-border pl-4">
        {events.map((event) => (
          <li key={event.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge source={event.item.source} />
              <StatusBadge status={event.item.status} />
              {event.date && (
                <span className="ml-auto text-xs text-muted">
                  {new Date(event.date).toLocaleString("pl-PL")}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm font-medium text-foreground">{event.label}</p>
            <Link
              href={`/monitoring/${event.item.id}`}
              className="mt-1 block text-sm text-muted hover:text-foreground hover:underline"
            >
              {event.item.title}
            </Link>
            {event.item.domains.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {event.item.domains.map(({ domain }) => (
                  <span
                    key={domain.id}
                    className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] font-medium"
                    style={{ borderColor: `${domain.color}40`, color: domain.color, background: `${domain.color}0d` }}
                  >
                    {domain.name}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
        {events.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
            Brak zarejestrowanych zmian — uruchom import (`npm run db:seed` lub
            przycisk „Odśwież dane”).
          </p>
        )}
      </ol>
    </div>
  );
}

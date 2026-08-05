import Link from "next/link";
import { getDashboardStats } from "@/lib/queries";
import { ItemCard } from "@/components/ItemCard";
import { SourceBadge } from "@/components/badges";
import { RefreshButton } from "@/components/RefreshButton";

export const dynamic = "force-dynamic";

const SOURCE_ORDER = ["SEJM", "RCL", "EUR_LEX", "MEDIA"] as const;

export default async function DashboardPage() {
  const stats = await getDashboardStats();

  return (
    <div className="flex flex-col gap-10">
      <section className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            Pulpit
          </p>
          <h1 className="mt-2 font-brand text-2xl text-foreground sm:text-3xl">
            Monitoring legislacyjny
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Bieżący przegląd procesów legislacyjnych istotnych dla klientów agencji —
            Sejm RP, Rządowe Centrum Legislacji oraz prawo unijne (EUR-Lex),
            pogrupowane według dziedzin.
          </p>
        </div>
        <RefreshButton />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Monitorowane pozycje" value={stats.totalItems} />
        <StatCard label="Nowe w tym tygodniu" value={stats.newThisWeek} accent />
        <StatCard label="Dziedziny" value={stats.domains.length} />
        <StatCard
          label="Źródła aktywne"
          value={SOURCE_ORDER.filter((s) => stats.bySource[s] > 0).length}
          suffix="/ 3"
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Dziedziny
          </h2>
          <Link href="/dziedziny" className="text-sm text-muted hover:text-foreground">
            Zobacz wszystkie →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.domains.map((domain) => (
            <Link
              key={domain.id}
              href={`/monitoring?dziedzina=${domain.slug}`}
              className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-foreground/30"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: domain.color }}
                />
                <span className="text-sm font-medium text-foreground">
                  {domain.name}
                </span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {domain._count.items}
              </p>
              <p className="text-xs text-muted">monitorowanych pozycji</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Źródła danych
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["SEJM", "RCL", "EUR_LEX"] as const).map((source) => {
            const log = stats.lastLogs.find((l) => l.source === source);
            return (
              <div
                key={source}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-center justify-between">
                  <SourceBadge source={source} />
                  <span className="text-lg font-semibold text-foreground">
                    {stats.bySource[source] ?? 0}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted">
                  {log
                    ? `Ostatnia synchronizacja: ${new Date(log.startedAt).toLocaleString("pl-PL")} · ${
                        log.status === "success" ? "dane na żywo" : "dane przykładowe"
                      }`
                    : "Brak jeszcze synchronizacji"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Ostatnia aktywność
          </h2>
          <Link href="/monitoring" className="text-sm text-muted hover:text-foreground">
            Pełen monitoring →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {stats.recentItems.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
          {stats.recentItems.length === 0 && (
            <p className="text-sm text-muted">
              Brak danych — uruchom import (`npm run db:seed`).
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  suffix,
}: {
  label: string;
  value: number;
  accent?: boolean;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${accent ? "text-emerald-700" : "text-foreground"}`}
      >
        {value}
        {suffix && <span className="ml-1 text-sm font-normal text-muted">{suffix}</span>}
      </p>
    </div>
  );
}

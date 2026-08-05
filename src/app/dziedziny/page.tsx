import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DziedzinyPage() {
  const domains = await prisma.domain.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    include: {
      _count: { select: { items: true } },
      keywords: true,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Konfiguracja
        </p>
        <h1 className="mt-2 font-brand text-2xl text-foreground sm:text-3xl">
          Dziedziny monitoringu
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Dokumenty pobrane z Sejmu RP, RCL i EUR-Lex są automatycznie
          klasyfikowane do poniższych dziedzin na podstawie słów kluczowych.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {domains.map((domain) => (
          <div key={domain.id} className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: domain.color }}
                />
                <h2 className="text-base font-semibold text-foreground">
                  {domain.name}
                </h2>
              </div>
              <span className="shrink-0 text-lg font-semibold text-foreground">
                {domain._count.items}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{domain.description}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {domain.keywords.slice(0, 10).map((k) => (
                <span
                  key={k.id}
                  className="rounded bg-black/[.04] px-1.5 py-0.5 text-[0.7rem] text-muted"
                >
                  {k.term}
                </span>
              ))}
              {domain.keywords.length > 10 && (
                <span className="text-[0.7rem] text-muted">
                  +{domain.keywords.length - 10} więcej
                </span>
              )}
            </div>
            <Link
              href={`/monitoring?dziedzina=${domain.slug}`}
              className="mt-4 inline-block text-sm font-medium text-foreground hover:underline"
            >
              Zobacz monitorowane pozycje →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

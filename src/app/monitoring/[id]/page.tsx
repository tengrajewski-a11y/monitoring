import Link from "next/link";
import { notFound } from "next/navigation";
import { getItemById } from "@/lib/queries";
import { StatusBadge, SourceBadge, KindLabel, DomainTag, FallbackNotice } from "@/components/badges";

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = await getItemById(id);
  if (!item) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/monitoring" className="text-sm text-muted hover:text-foreground">
        ← Wróć do monitoringu
      </Link>

      <div className="rounded-lg border border-border bg-surface p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={item.source} />
          <StatusBadge status={item.status} />
          <KindLabel kind={item.kind} />
          {item.isFallback && <FallbackNotice />}
        </div>

        <h1 className="mt-4 text-xl font-semibold leading-snug text-foreground sm:text-2xl">
          {item.title}
        </h1>

        {item.summary && (
          <p className="mt-3 text-sm leading-relaxed text-muted">{item.summary}</p>
        )}

        {item.domains.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {item.domains.map(({ domain }) => (
              <DomainTag
                key={domain.id}
                name={domain.name}
                color={domain.color}
                href={`/monitoring?dziedzina=${domain.slug}`}
              />
            ))}
          </div>
        )}

        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-2">
          {item.institution && (
            <Field label="Instytucja" value={item.institution} />
          )}
          {item.stage && <Field label="Aktualny etap" value={item.stage} />}
          {item.documentDate && (
            <Field
              label="Data dokumentu"
              value={new Date(item.documentDate).toLocaleDateString("pl-PL")}
            />
          )}
          {item.publishedAt && (
            <Field
              label="Data publikacji"
              value={new Date(item.publishedAt).toLocaleDateString("pl-PL")}
            />
          )}
        </dl>

        <div className="mt-6 border-t border-border pt-6">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Zobacz źródło ↗
          </a>
        </div>
      </div>

      {item.events.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-5 sm:p-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
            Historia procesu
          </h2>
          <ol className="mt-4 flex flex-col gap-3 border-l border-border pl-4">
            {item.events.map((event) => (
              <li key={event.id} className="text-sm">
                <p className="font-medium text-foreground">{event.label}</p>
                {event.date && (
                  <p className="text-xs text-muted">
                    {new Date(event.date).toLocaleDateString("pl-PL")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

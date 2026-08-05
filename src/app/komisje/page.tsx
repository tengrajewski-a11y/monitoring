import Link from "next/link";
import { getCommittees } from "@/lib/queries";
import { FallbackNotice } from "@/components/badges";
import { pluralizePL } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function KomisjePage() {
  const committees = await getCommittees();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Komisje sejmowe
        </p>
        <h1 className="mt-2 font-brand text-2xl text-foreground sm:text-3xl">
          Komisje i ich posiedzenia
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Przegląd komisji sejmowych istotnych dla monitorowanych dziedzin
          wraz z relacjami z ostatnich posiedzeń.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {committees.map((committee) => {
          const lastSitting = committee.sittings[0];
          return (
            <Link
              key={committee.id}
              href={`/komisje/${committee.code}`}
              className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-foreground/30"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold leading-snug text-foreground">
                  {committee.name}
                </h2>
                {committee.isFallback && <FallbackNotice />}
              </div>
              {committee.scope && (
                <p className="mt-2 text-sm text-muted">{committee.scope}</p>
              )}
              <div className="mt-4 flex items-center justify-between text-xs text-muted">
                <span>
                  {committee._count.sittings}{" "}
                  {pluralizePL(committee._count.sittings, "posiedzenie", "posiedzenia", "posiedzeń")}{" "}
                  w bazie
                </span>
                {lastSitting?.date && (
                  <span>
                    Ostatnie: {new Date(lastSitting.date).toLocaleDateString("pl-PL")}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
        {committees.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
            Brak danych — uruchom import (`npm run db:seed`).
          </p>
        )}
      </div>
    </div>
  );
}

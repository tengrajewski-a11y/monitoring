import Link from "next/link";
import { notFound } from "next/navigation";
import { getCommitteeByCode } from "@/lib/queries";
import { FallbackNotice } from "@/components/badges";
import { COMMITTEE_TYPE_LABEL } from "@/lib/labels";
import { TranscriptPanel } from "@/components/TranscriptPanel";
import { getCurrentUser } from "@/lib/auth";
import { isTranscriptionConfigured } from "@/lib/transcription";

export const dynamic = "force-dynamic";
// Transkrypcja dłuższych nagrań przez Whisper API może potrwać kilka minut.
export const maxDuration = 300;

export default async function KomisjaDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [committee, user] = await Promise.all([getCommitteeByCode(code), getCurrentUser()]);
  if (!committee) notFound();

  const canEditTranscript = user?.role === "ADMIN" || user?.role === "AGENCY";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/komisje" className="text-sm text-muted hover:text-foreground">
        ← Wróć do komisji
      </Link>

      <div className="rounded-lg border border-border bg-surface p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
            {committee.name}
          </h1>
          {committee.isFallback && <FallbackNotice />}
        </div>
        {committee.scope && (
          <p className="mt-3 text-sm leading-relaxed text-muted">{committee.scope}</p>
        )}
        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Kod komisji</dt>
            <dd className="mt-1 text-sm text-foreground">{committee.code}</dd>
          </div>
          {committee.type && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Typ</dt>
              <dd className="mt-1 text-sm text-foreground">
                {COMMITTEE_TYPE_LABEL[committee.type] ?? committee.type}
              </dd>
            </div>
          )}
          {committee.phone && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Telefon</dt>
              <dd className="mt-1 text-sm text-foreground">{committee.phone}</dd>
            </div>
          )}
        </dl>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground">
          Relacje z posiedzeń
        </h2>
        <div className="flex flex-col gap-3">
          {committee.sittings.map((sitting) => (
            <div key={sitting.id} className="rounded-lg border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  Posiedzenie nr {sitting.number}
                </span>
                {sitting.date && (
                  <span className="text-xs text-muted">
                    {new Date(sitting.date).toLocaleDateString("pl-PL")}
                  </span>
                )}
              </div>
              {sitting.agenda && (
                <p className="mt-2 text-sm text-muted">{sitting.agenda}</p>
              )}
              {sitting.remoteUrl && (
                <a
                  href={sitting.remoteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm font-medium text-foreground hover:underline"
                >
                  Zobacz transmisję/nagranie ↗
                </a>
              )}
              {canEditTranscript ? (
                <TranscriptPanel
                  sittingId={sitting.id}
                  transcript={sitting.transcript}
                  transcriptionConfigured={isTranscriptionConfigured()}
                />
              ) : (
                sitting.transcript && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-medium text-foreground">
                      Transkrypcja
                    </summary>
                    <p className="mt-2 whitespace-pre-line text-sm text-muted">
                      {sitting.transcript}
                    </p>
                  </details>
                )
              )}
            </div>
          ))}
          {committee.sittings.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">
              Brak zarejestrowanych posiedzeń tej komisji.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

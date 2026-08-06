"use client";

import { useActionState, useRef, useState } from "react";
import {
  saveSittingTranscript,
  transcribeSittingAudio,
  type TranscribeState,
} from "@/app/komisje/[code]/actions";

const initialState: TranscribeState = {};

export function TranscriptPanel({
  sittingId,
  transcript,
  transcriptionConfigured,
}: {
  sittingId: string;
  transcript: string | null;
  transcriptionConfigured: boolean;
}) {
  const [state, formAction, pending] = useActionState(transcribeSittingAudio, initialState);
  const [editing, setEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          Transkrypcja
        </span>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-xs font-medium text-muted hover:text-foreground"
        >
          {editing ? "Zamknij edycję" : transcript ? "Edytuj / dodaj nagranie" : "Dodaj transkrypcję"}
        </button>
      </div>

      {!editing && transcript && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Pokaż tekst ({transcript.length.toLocaleString("pl-PL")} znaków)
          </summary>
          <p className="mt-2 whitespace-pre-line text-sm text-muted">{transcript}</p>
        </details>
      )}

      {editing && (
        <div className="mt-3 flex flex-col gap-4">
          <div>
            {transcriptionConfigured ? (
              <form
                action={(fd) => {
                  fd.set("sittingId", sittingId);
                  formAction(fd);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  name="file"
                  accept="audio/*,video/mp4,video/webm"
                  required
                  className="text-xs"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
                >
                  {pending ? "Transkrybowanie…" : "Transkrybuj plik (AI)"}
                </button>
              </form>
            ) : (
              <p className="text-xs text-muted">
                Automatyczna transkrypcja (Whisper) nie jest skonfigurowana — brak zmiennej
                środowiskowej <code className="rounded bg-black/[.04] px-1">OPENAI_API_KEY</code>.
                Możesz nadal wkleić gotowy tekst poniżej.
              </p>
            )}
            {pending && (
              <p className="mt-1 text-xs text-muted">
                To może potrwać kilka minut przy dłuższych nagraniach — nie zamykaj strony.
              </p>
            )}
            {state.error && (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
                {state.error}
              </p>
            )}
            {state.success && (
              <p className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
                Dodano transkrypcję fragmentu poniżej tekstu.
              </p>
            )}
            <p className="mt-1 text-[0.7rem] text-muted">
              Nagranie dłuższe niż ok. 25 MB? Podziel je na fragmenty i wgraj po kolei — każdy
              zostanie dopisany do transkrypcji.
            </p>
          </div>

          <form action={saveSittingTranscript} className="flex flex-col gap-2">
            <input type="hidden" name="sittingId" value={sittingId} />
            <label className="text-xs font-medium uppercase tracking-wide text-muted">
              Pełny tekst transkrypcji (edytowalny ręcznie)
            </label>
            <textarea
              name="transcript"
              defaultValue={transcript ?? ""}
              rows={8}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              placeholder="Wklej gotowy tekst transkrypcji albo popraw wynik AI powyżej…"
            />
            <button
              type="submit"
              className="self-start rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted hover:border-foreground/40 hover:text-foreground"
            >
              Zapisz tekst
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

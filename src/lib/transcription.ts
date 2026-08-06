/**
 * Transkrypcja nagrań (speech-to-text) posiedzeń komisji poprzez OpenAI
 * Whisper API. Wymaga zmiennej środowiskowej OPENAI_API_KEY.
 *
 * Dokumentacja: https://platform.openai.com/docs/api-reference/audio/createTranscription
 */

const OPENAI_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1";

export const MAX_AUDIO_FILE_BYTES = 25 * 1024 * 1024; // limit Whisper API

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export function isTranscriptionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function transcribeAudioFile(file: File): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Transkrypcja AI nie jest skonfigurowana — brak zmiennej środowiskowej OPENAI_API_KEY.",
    };
  }

  if (file.size > MAX_AUDIO_FILE_BYTES) {
    return {
      ok: false,
      error: `Plik jest za duży (${(file.size / 1024 / 1024).toFixed(1)} MB). Whisper API przyjmuje maksymalnie 25 MB — podziel nagranie na krótsze fragmenty i wgraj je po kolei.`,
    };
  }

  const form = new FormData();
  form.append("file", file, file.name);
  form.append("model", MODEL);
  form.append("language", "pl");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 280_000);

  try {
    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Błąd Whisper API (HTTP ${res.status}): ${body.slice(0, 300)}` };
    }

    const data = (await res.json()) as { text?: string };
    if (!data.text) {
      return { ok: false, error: "Whisper API nie zwróciło tekstu transkrypcji." };
    }

    return { ok: true, text: data.text.trim() };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Nieznany błąd podczas transkrypcji.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

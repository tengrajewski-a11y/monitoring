"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { transcribeAudioFile } from "@/lib/transcription";

export type TranscribeState = { error?: string; success?: boolean };

function joinTranscript(existing: string | null, addition: string): string {
  const trimmedExisting = (existing ?? "").trim();
  return trimmedExisting ? `${trimmedExisting}\n\n${addition}` : addition;
}

export async function transcribeSittingAudio(
  _prevState: TranscribeState,
  formData: FormData,
): Promise<TranscribeState> {
  await requireStaff();

  const sittingId = String(formData.get("sittingId") ?? "");
  const file = formData.get("file");

  if (!sittingId) return { error: "Brak identyfikatora posiedzenia." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Wybierz plik audio do transkrypcji." };
  }

  const result = await transcribeAudioFile(file);
  if (!result.ok) return { error: result.error };

  const sitting = await prisma.committeeSitting.findUnique({ where: { id: sittingId } });
  if (!sitting) return { error: "Nie znaleziono posiedzenia." };

  await prisma.committeeSitting.update({
    where: { id: sittingId },
    data: { transcript: joinTranscript(sitting.transcript, result.text) },
  });

  revalidatePath("/komisje/[code]", "page");
  return { success: true };
}

export async function saveSittingTranscript(formData: FormData) {
  await requireStaff();

  const sittingId = String(formData.get("sittingId") ?? "");
  const transcript = String(formData.get("transcript") ?? "").trim();
  if (!sittingId) return;

  await prisma.committeeSitting.update({
    where: { id: sittingId },
    data: { transcript: transcript || null },
  });

  revalidatePath("/komisje/[code]", "page");
}

import type { ItemStatus, SourceType, ItemKind } from "../generated/prisma/client";

export const STATUS_LABEL: Record<ItemStatus, string> = {
  NOWY: "Nowy",
  W_TOKU: "W toku",
  PRZYJETY: "Przyjęty",
  ODRZUCONY: "Odrzucony",
  OPUBLIKOWANY: "Opublikowany",
  WYCOFANY: "Wycofany",
  NIEZNANY: "Nieznany",
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  SEJM: "Sejm RP",
  RCL: "RCL",
  EUR_LEX: "EUR-Lex",
  MEDIA: "Media",
};

export const COMMITTEE_TYPE_LABEL: Record<string, string> = {
  STANDING: "Stała",
  EXTRAORDINARY: "Nadzwyczajna",
  INVESTIGATIVE: "Śledcza",
};

/** Polska odmiana rzeczownika po liczebniku, np. pluralizePL(3, "posiedzenie", "posiedzenia", "posiedzeń"). */
export function pluralizePL(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const lastDigit = n % 10;
  const lastTwo = n % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

export const KIND_LABEL: Record<ItemKind, string> = {
  USTAWA: "Ustawa",
  ROZPORZADZENIE: "Rozporządzenie",
  PROJEKT: "Projekt",
  AKT_MP: "Akt (Monitor Polski)",
  DYREKTYWA_UE: "Dyrektywa UE",
  ROZPORZADZENIE_UE: "Rozporządzenie UE",
  KOMUNIKAT_UE: "Komunikat UE",
  WNIOSEK_UE: "Wniosek UE",
  ARTYKUL_MEDIALNY: "Artykuł",
  INNE: "Inne",
};

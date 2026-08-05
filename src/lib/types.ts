export type NormalizedItemKind =
  | "USTAWA"
  | "ROZPORZADZENIE"
  | "PROJEKT"
  | "DYREKTYWA_UE"
  | "ROZPORZADZENIE_UE"
  | "KOMUNIKAT_UE"
  | "WNIOSEK_UE"
  | "ARTYKUL_MEDIALNY"
  | "INNE";

export type NormalizedItemStatus =
  | "NOWY"
  | "W_TOKU"
  | "PRZYJETY"
  | "ODRZUCONY"
  | "OPUBLIKOWANY"
  | "WYCOFANY"
  | "NIEZNANY";

/** Wspólny kształt dokumentu produkowany przez każdy konektor źródłowy. */
export type NormalizedItem = {
  externalId: string;
  kind: NormalizedItemKind;
  status: NormalizedItemStatus;
  title: string;
  summary?: string;
  stage?: string;
  institution?: string;
  url: string;
  documentDate?: Date;
  publishedAt?: Date;
  domainSlugs: string[];
  raw?: unknown;
};

export type ConnectorResult = {
  items: NormalizedItem[];
  isFallback: boolean;
  errorMessage?: string;
};

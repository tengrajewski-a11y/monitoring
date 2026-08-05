import type { ItemStatus, SourceType, ItemKind } from "../generated/prisma/client";

const STATUS_LABEL: Record<ItemStatus, string> = {
  NOWY: "Nowy",
  W_TOKU: "W toku",
  PRZYJETY: "Przyjęty",
  ODRZUCONY: "Odrzucony",
  OPUBLIKOWANY: "Opublikowany",
  WYCOFANY: "Wycofany",
  NIEZNANY: "Nieznany",
};

const STATUS_STYLE: Record<ItemStatus, string> = {
  NOWY: "bg-blue-50 text-blue-800 border-blue-200",
  W_TOKU: "bg-amber-50 text-amber-800 border-amber-200",
  PRZYJETY: "bg-emerald-50 text-emerald-800 border-emerald-200",
  ODRZUCONY: "bg-red-50 text-red-800 border-red-200",
  OPUBLIKOWANY: "bg-emerald-50 text-emerald-800 border-emerald-200",
  WYCOFANY: "bg-zinc-100 text-zinc-600 border-zinc-200",
  NIEZNANY: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

const SOURCE_LABEL: Record<SourceType, string> = {
  SEJM: "Sejm RP",
  RCL: "RCL",
  EUR_LEX: "EUR-Lex",
  MEDIA: "Media",
};

export function SourceBadge({ source }: { source: SourceType }) {
  return (
    <span className="inline-flex items-center rounded border border-border bg-surface px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
      {SOURCE_LABEL[source]}
    </span>
  );
}

const KIND_LABEL: Record<ItemKind, string> = {
  USTAWA: "Ustawa",
  ROZPORZADZENIE: "Rozporządzenie",
  PROJEKT: "Projekt",
  DYREKTYWA_UE: "Dyrektywa UE",
  ROZPORZADZENIE_UE: "Rozporządzenie UE",
  KOMUNIKAT_UE: "Komunikat UE",
  WNIOSEK_UE: "Wniosek UE",
  ARTYKUL_MEDIALNY: "Artykuł",
  INNE: "Inne",
};

export function KindLabel({ kind }: { kind: ItemKind }) {
  return <span className="text-xs text-muted">{KIND_LABEL[kind]}</span>;
}

export function DomainTag({
  name,
  color,
  href,
}: {
  name: string;
  color: string;
  href?: string;
}) {
  const content = (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={{ borderColor: `${color}40`, color, background: `${color}0d` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
  if (href) {
    return <a href={href}>{content}</a>;
  }
  return content;
}

export function FallbackNotice() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-0.5 text-[0.7rem] text-muted"
      title="Brak połączenia z API źródłowym w tym środowisku — pokazano dane przykładowe."
    >
      dane przykładowe
    </span>
  );
}

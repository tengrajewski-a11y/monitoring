import type { ConnectorResult, NormalizedItem } from "../types";
import { classifyTextToDomainSlugs } from "../domains";

/**
 * Konektor do oficjalnego API Sejmu RP (https://api.sejm.gov.pl/).
 *
 * Wykorzystywane endpointy:
 *  - GET /sejm/term{term}/processes        — lista procesów legislacyjnych (druki, projekty ustaw)
 *  - GET /eli/acts/DU/{year}                — akty ogłoszone w Dzienniku Ustaw (System Informacji Prawnej ELI)
 *
 * Uwaga: dokładny kształt pól odpowiedzi API bywa aktualizowany przez Kancelarię Sejmu.
 * Parsowanie poniżej jest maksymalnie defensywne (opcjonalne pola, wiele wariantów nazw),
 * a w razie niepowodzenia sieciowego/parsowania konektor zwraca dane przykładowe
 * (isFallback: true), żeby aplikacja zawsze pokazywała spójny widok.
 */

const API_BASE = "https://api.sejm.gov.pl";
const CURRENT_TERM = 10;

type RawProcess = {
  number?: string | number;
  title?: string;
  description?: string;
  documentDate?: string;
  processStartDate?: string;
  changeDate?: string;
  comments?: string;
  UE?: boolean;
  principle?: string;
  urgencyStatus?: string;
  processTypeDesc?: string;
  stages?: Array<{ stageName?: string; date?: string }>;
};

type RawEliAct = {
  ELI?: string;
  address?: string;
  title?: string;
  type?: string;
  announcementDate?: string;
  promulgation?: string;
  status?: string;
  publisher?: string;
  year?: number;
  pos?: number;
  keywords?: string[];
};

function deriveStatusFromProcess(p: RawProcess): NormalizedItem["status"] {
  const text = `${p.comments ?? ""} ${p.stages?.at(-1)?.stageName ?? ""}`.toLowerCase();
  if (text.includes("odrzuc")) return "ODRZUCONY";
  if (text.includes("wycof")) return "WYCOFANY";
  if (text.includes("uchwalon") || text.includes("podpisan") || text.includes("ogłoszon"))
    return "PRZYJETY";
  if (p.stages && p.stages.length > 0) return "W_TOKU";
  return "NOWY";
}

function mapProcess(p: RawProcess): NormalizedItem | null {
  const number = p.number != null ? String(p.number) : undefined;
  const title = p.title || p.description;
  if (!number || !title) return null;

  const lastStage = p.stages?.at(-1);
  const classifyText = `${title} ${p.description ?? ""} ${p.comments ?? ""}`;

  return {
    externalId: `sejm-process-${CURRENT_TERM}-${number}`,
    kind: "PROJEKT",
    status: deriveStatusFromProcess(p),
    title,
    summary: p.description && p.description !== title ? p.description : p.comments,
    stage: lastStage?.stageName
      ? `${lastStage.stageName}${lastStage.date ? ` (${lastStage.date})` : ""}`
      : undefined,
    institution: p.UE ? "Sejm RP / UE" : "Sejm RP",
    url: `https://www.sejm.gov.pl/Sejm${CURRENT_TERM}.nsf/PrzebiegProc.xsp?nr=${number}`,
    documentDate: p.documentDate ? new Date(p.documentDate) : undefined,
    publishedAt: p.processStartDate ? new Date(p.processStartDate) : undefined,
    domainSlugs: classifyTextToDomainSlugs(classifyText),
    raw: p,
  };
}

function mapEliAct(a: RawEliAct): NormalizedItem | null {
  const address = a.ELI || a.address;
  const title = a.title;
  if (!address || !title) return null;

  const isRegulation = (a.type ?? "").toLowerCase().includes("rozporz");
  const classifyText = `${title} ${(a.keywords ?? []).join(" ")}`;

  return {
    externalId: `sejm-eli-${address}`,
    kind: isRegulation ? "ROZPORZADZENIE" : "USTAWA",
    status: "OPUBLIKOWANY",
    title,
    summary: a.type,
    institution: "Dziennik Ustaw",
    url: `https://eli.gov.pl/eli/${address}`,
    documentDate: a.promulgation ? new Date(a.promulgation) : undefined,
    publishedAt: a.announcementDate ? new Date(a.announcementDate) : undefined,
    domainSlugs: classifyTextToDomainSlugs(classifyText),
    raw: a,
  };
}

async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSejmItems(): Promise<ConnectorResult> {
  try {
    const [processes, eliActs] = await Promise.all([
      fetchJson<RawProcess[]>(`${API_BASE}/sejm/term${CURRENT_TERM}/processes`),
      fetchJson<RawEliAct[]>(
        `${API_BASE}/eli/acts/DU/${new Date().getFullYear()}`,
      ).catch(() => [] as RawEliAct[]),
    ]);

    const items: NormalizedItem[] = [
      ...processes.map(mapProcess).filter((x): x is NormalizedItem => x !== null),
      ...eliActs.map(mapEliAct).filter((x): x is NormalizedItem => x !== null),
    ];

    if (items.length === 0) {
      throw new Error("API zwróciło pustą listę — prawdopodobna zmiana kontraktu API");
    }

    return { items, isFallback: false };
  } catch (err) {
    return {
      items: sejmFallbackItems(),
      isFallback: true,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Dane przykładowe używane, gdy API Sejmu jest niedostępne (np. brak dostępu sieciowego w środowisku). */
export function sejmFallbackItems(): NormalizedItem[] {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  return [
    {
      externalId: "sejm-process-10-demo-1",
      kind: "PROJEKT",
      status: "W_TOKU",
      title:
        "Rządowy projekt ustawy o zmianie ustawy – Prawo energetyczne oraz niektórych innych ustaw",
      summary:
        "Projekt wprowadza przepisy dotyczące przyspieszenia przyłączeń instalacji OZE do sieci elektroenergetycznej.",
      stage: `Skierowano do Komisji do Spraw Energii (${daysAgo(4).toLocaleDateString("pl-PL")})`,
      institution: "Sejm RP",
      url: "https://www.sejm.gov.pl/Sejm10.nsf/PrzebiegProc.xsp?nr=612",
      documentDate: daysAgo(20),
      publishedAt: daysAgo(19),
      domainSlugs: ["energetyka-i-klimat"],
    },
    {
      externalId: "sejm-process-10-demo-2",
      kind: "PROJEKT",
      status: "NOWY",
      title: "Poselski projekt ustawy o zmianie ustawy o refundacji leków, środków spożywczych specjalnego przeznaczenia żywieniowego oraz wyrobów medycznych",
      summary: "Projekt skraca terminy wydawania decyzji refundacyjnych i porządkuje wykaz leków refundowanych.",
      stage: `Wpłynął do Sejmu (${daysAgo(2).toLocaleDateString("pl-PL")})`,
      institution: "Sejm RP",
      url: "https://www.sejm.gov.pl/Sejm10.nsf/PrzebiegProc.xsp?nr=598",
      documentDate: daysAgo(2),
      domainSlugs: ["zdrowie-i-farmacja"],
    },
    {
      externalId: "sejm-process-10-demo-3",
      kind: "PROJEKT",
      status: "W_TOKU",
      title: "Rządowy projekt ustawy o krajowym systemie cyberbezpieczeństwa (implementacja dyrektywy NIS2)",
      summary: "Wdrożenie dyrektywy NIS2 do polskiego porządku prawnego, nowe obowiązki dla podmiotów kluczowych i ważnych.",
      stage: `II czytanie na posiedzeniu Sejmu (${daysAgo(7).toLocaleDateString("pl-PL")})`,
      institution: "Sejm RP / UE",
      url: "https://www.sejm.gov.pl/Sejm10.nsf/PrzebiegProc.xsp?nr=550",
      documentDate: daysAgo(60),
      publishedAt: daysAgo(58),
      domainSlugs: ["cyfryzacja-i-telekomunikacja"],
    },
    {
      externalId: "sejm-process-10-demo-4",
      kind: "PROJEKT",
      status: "PRZYJETY",
      title: "Rządowy projekt ustawy o zmianie ustawy o prawach konsumenta oraz niektórych innych ustaw",
      summary: "Nowe obowiązki informacyjne dla platform handlu elektronicznego oraz zasady dot. opinii konsumenckich online.",
      stage: `Ustawa przekazana Prezydentowi do podpisu (${daysAgo(10).toLocaleDateString("pl-PL")})`,
      institution: "Sejm RP",
      url: "https://www.sejm.gov.pl/Sejm10.nsf/PrzebiegProc.xsp?nr=477",
      documentDate: daysAgo(120),
      publishedAt: daysAgo(118),
      domainSlugs: ["handel-i-e-commerce"],
    },
    {
      externalId: "sejm-eli-demo-du-2026-1200",
      kind: "USTAWA",
      status: "OPUBLIKOWANY",
      title: "Ustawa z dnia 3 lipca 2026 r. o systemach wsparcia wytwarzania energii z magazynów energii",
      summary: "Ustawa (Dziennik Ustaw)",
      institution: "Dziennik Ustaw",
      url: "https://eli.gov.pl/eli/DU/2026/1200",
      documentDate: daysAgo(30),
      publishedAt: daysAgo(28),
      domainSlugs: ["energetyka-i-klimat"],
    },
  ];
}

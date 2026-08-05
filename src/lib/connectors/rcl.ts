import * as cheerio from "cheerio";
import type { ConnectorResult, NormalizedItem } from "../types";
import { classifyTextToDomainSlugs } from "../domains";

/**
 * Konektor do Rządowego Centrum Legislacji (legislacja.rcl.gov.pl).
 *
 * RCL nie udostępnia publicznego API — dane pobierane są przez parsowanie
 * stron "Wykazu prac legislacyjnych" (listy projektów ustaw / rozporządzeń).
 * Selektory HTML mogą wymagać dostrojenia po wdrożeniu w środowisku z realnym
 * dostępem sieciowym do legislacja.rcl.gov.pl (ten sandbox ma zablokowany
 * dostęp do tej domeny w polityce sieciowej). W razie niepowodzenia
 * parsowania konektor zwraca dane przykładowe (isFallback: true).
 */

const BASE = "https://legislacja.rcl.gov.pl";

const LISTS: Array<{ url: string; kind: "PROJEKT" }> = [
  { url: `${BASE}/lista?typeId=2`, kind: "PROJEKT" }, // projekty ustaw
  { url: `${BASE}/lista?typeId=10`, kind: "PROJEKT" }, // projekty rozporządzeń
];

async function fetchHtml(url: string, timeoutMs = 15_000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html",
        "User-Agent": "Mozilla/5.0 (compatible; TrinityTrustMonitor/1.0)",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function parseListPage(html: string): NormalizedItem[] {
  const $ = cheerio.load(html);
  const items: NormalizedItem[] = [];

  $("a[href*='/projekt/']").each((_, el) => {
    const href = $(el).attr("href");
    const title = $(el).text().trim();
    if (!href || !title || title.length < 8) return;

    const idMatch = href.match(/\/projekt\/(\d+)/);
    const id = idMatch?.[1];
    if (!id) return;

    // Metadane odczytywane z sąsiednich komórek wiersza tabeli (jeśli dostępne)
    const row = $(el).closest("tr");
    const cells = row.find("td").map((__, td) => $(td).text().trim()).get();
    const stageGuess = cells.find((c) => /etap|opiniowani|uzgodni|komitet|rada ministr/i.test(c));
    const dateGuess = cells.find((c) => /^\d{2}[.-]\d{2}[.-]\d{4}$/.test(c));

    items.push({
      externalId: `rcl-${id}`,
      kind: "PROJEKT",
      status: /przyj|zakończon/i.test(stageGuess ?? "") ? "PRZYJETY" : "W_TOKU",
      title,
      stage: stageGuess,
      institution: "Rządowe Centrum Legislacji",
      url: href.startsWith("http") ? href : `${BASE}${href}`,
      documentDate: dateGuess ? parsePolishDate(dateGuess) : undefined,
      domainSlugs: classifyTextToDomainSlugs(title),
    });
  });

  return items;
}

function parsePolishDate(s: string): Date | undefined {
  const m = s.match(/^(\d{2})[.-](\d{2})[.-](\d{4})$/);
  if (!m) return undefined;
  const [, dd, mm, yyyy] = m;
  return new Date(`${yyyy}-${mm}-${dd}`);
}

export async function fetchRclItems(): Promise<ConnectorResult> {
  try {
    const pages = await Promise.all(LISTS.map((l) => fetchHtml(l.url)));
    const items = pages.flatMap(parseListPage);

    const deduped = Array.from(
      new Map(items.map((i) => [i.externalId, i])).values(),
    );

    if (deduped.length === 0) {
      throw new Error(
        "Nie znaleziono żadnych projektów na stronach listy RCL — prawdopodobna zmiana struktury HTML",
      );
    }

    return { items: deduped, isFallback: false };
  } catch (err) {
    return {
      items: rclFallbackItems(),
      isFallback: true,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Dane przykładowe używane, gdy RCL jest niedostępny lub struktura strony się zmieniła. */
export function rclFallbackItems(): NormalizedItem[] {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  return [
    {
      externalId: "rcl-demo-1",
      kind: "PROJEKT",
      status: "W_TOKU",
      title: "Projekt rozporządzenia Ministra Klimatu i Środowiska w sprawie szczegółowych warunków przyłączenia magazynów energii do sieci",
      stage: "Uzgodnienia międzyresortowe",
      institution: "Ministerstwo Klimatu i Środowiska",
      url: "https://legislacja.rcl.gov.pl/projekt/12400000",
      documentDate: daysAgo(15),
      domainSlugs: ["energetyka-i-klimat"],
    },
    {
      externalId: "rcl-demo-2",
      kind: "PROJEKT",
      status: "W_TOKU",
      title: "Projekt ustawy o zmianie ustawy o świadczeniach opieki zdrowotnej finansowanych ze środków publicznych",
      stage: "Konsultacje publiczne",
      institution: "Ministerstwo Zdrowia",
      url: "https://legislacja.rcl.gov.pl/projekt/12400001",
      documentDate: daysAgo(9),
      domainSlugs: ["zdrowie-i-farmacja"],
    },
    {
      externalId: "rcl-demo-3",
      kind: "PROJEKT",
      status: "NOWY",
      title: "Projekt rozporządzenia Rady Ministrów w sprawie Krajowych Ram Interoperacyjności systemów teleinformatycznych",
      stage: "Skierowano do opiniowania",
      institution: "Kancelaria Prezesa Rady Ministrów",
      url: "https://legislacja.rcl.gov.pl/projekt/12400002",
      documentDate: daysAgo(3),
      domainSlugs: ["cyfryzacja-i-telekomunikacja"],
    },
    {
      externalId: "rcl-demo-4",
      kind: "PROJEKT",
      status: "PRZYJETY",
      title: "Projekt ustawy o zmianie ustawy o ochronie niektórych praw konsumentów w handlu internetowym",
      stage: "Przyjęty przez Radę Ministrów",
      institution: "Ministerstwo Rozwoju i Technologii",
      url: "https://legislacja.rcl.gov.pl/projekt/12400003",
      documentDate: daysAgo(35),
      domainSlugs: ["handel-i-e-commerce"],
    },
  ];
}

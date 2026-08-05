import type { ConnectorResult, NormalizedItem } from "../types";
import { DOMAINS } from "../domains";

/**
 * Konektor do unijnej bazy aktów prawnych EUR-Lex, poprzez publiczny
 * endpoint SPARQL repozytorium CELLAR (metadane wszystkich aktów UE).
 * Dokumentacja: https://eur-lex.europa.eu/content/help/data-reuse/webservice.html
 *
 * Dla każdej dziedziny budowane jest osobne zapytanie SPARQL filtrujące
 * tytuły aktów (w j. angielskim) po słowach kluczowych właściwych danej
 * dziedzinie. W razie niedostępności endpointu (np. brak dostępu sieciowego)
 * konektor zwraca dane przykładowe (isFallback: true).
 */

const SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";

type SparqlBinding = {
  work?: { value: string };
  title?: { value: string };
  date?: { value: string };
  celex?: { value: string };
  type?: { value: string };
};

type SparqlResponse = {
  results?: { bindings?: SparqlBinding[] };
};

function buildQuery(keywords: string[], limit = 8): string {
  const escaped = keywords.map((k) => k.replace(/"/g, '\\"'));
  const regex = escaped.join("|");
  return `
PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?work ?title ?date ?celex ?type WHERE {
  ?work cdm:work_has_expression ?exp .
  ?exp cdm:expression_belongs_to_language <http://publications.europa.eu/resource/authority/language/ENG> .
  ?exp cdm:expression_title ?title .
  ?work cdm:work_date_document ?date .
  ?work cdm:resource_legal_id_celex ?celex .
  OPTIONAL { ?work cdm:resource_legal_resource-type-value ?type }
  FILTER(REGEX(?title, "${regex}", "i"))
}
ORDER BY DESC(?date)
LIMIT ${limit}
`.trim();
}

async function runSparqlQuery(query: string, timeoutMs = 20_000): Promise<SparqlBinding[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(SPARQL_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
      },
      body: new URLSearchParams({ query }).toString(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} from EUR-Lex SPARQL`);
    const json = (await res.json()) as SparqlResponse;
    return json.results?.bindings ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

function celexToKind(celex: string): NormalizedItem["kind"] {
  // Sektor 3 CELEX = akty prawne UE; litera po roku wskazuje typ (R=rozporządzenie, L=dyrektywa)
  if (/^3\d{4}L/.test(celex)) return "DYREKTYWA_UE";
  if (/^3\d{4}R/.test(celex)) return "ROZPORZADZENIE_UE";
  return "WNIOSEK_UE";
}

function mapBinding(b: SparqlBinding, domainSlug: string): NormalizedItem | null {
  const celex = b.celex?.value;
  const title = b.title?.value;
  if (!celex || !title) return null;

  return {
    externalId: `eurlex-${celex}`,
    kind: celexToKind(celex),
    status: "OPUBLIKOWANY",
    title,
    institution: "Unia Europejska",
    url: `https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:${celex}`,
    documentDate: b.date?.value ? new Date(b.date.value) : undefined,
    domainSlugs: [domainSlug],
    raw: b,
  };
}

export async function fetchEurLexItems(): Promise<ConnectorResult> {
  try {
    const perDomain = await Promise.all(
      DOMAINS.map(async (domain) => {
        const bindings = await runSparqlQuery(buildQuery(domain.euKeywords));
        return bindings
          .map((b) => mapBinding(b, domain.slug))
          .filter((x): x is NormalizedItem => x !== null);
      }),
    );

    const items = perDomain.flat();
    const deduped = Array.from(
      new Map(items.map((i) => [i.externalId, i])).values(),
    );

    if (deduped.length === 0) {
      throw new Error("SPARQL endpoint zwrócił pustą listę dla wszystkich dziedzin");
    }

    return { items: deduped, isFallback: false };
  } catch (err) {
    return {
      items: eurLexFallbackItems(),
      isFallback: true,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Dane przykładowe używane, gdy endpoint SPARQL EUR-Lex jest niedostępny. */
export function eurLexFallbackItems(): NormalizedItem[] {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  return [
    {
      externalId: "eurlex-demo-32026r0140",
      kind: "ROZPORZADZENIE_UE",
      status: "OPUBLIKOWANY",
      title: "Regulation (EU) 2026/140 on accelerating permitting for renewable energy grid connections",
      institution: "Unia Europejska",
      url: "https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:32026R0140",
      documentDate: daysAgo(40),
      domainSlugs: ["energetyka-i-klimat"],
    },
    {
      externalId: "eurlex-demo-32025l0879",
      kind: "DYREKTYWA_UE",
      status: "OPUBLIKOWANY",
      title: "Directive (EU) 2025/879 amending rules on clinical trials transparency for medicinal products",
      institution: "Unia Europejska",
      url: "https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:32025L0879",
      documentDate: daysAgo(90),
      domainSlugs: ["zdrowie-i-farmacja"],
    },
    {
      externalId: "eurlex-demo-32026r0055",
      kind: "ROZPORZADZENIE_UE",
      status: "OPUBLIKOWANY",
      title: "Regulation (EU) 2026/55 implementing the Artificial Intelligence Act — high-risk system requirements",
      institution: "Unia Europejska",
      url: "https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:32026R0055",
      documentDate: daysAgo(25),
      domainSlugs: ["cyfryzacja-i-telekomunikacja"],
    },
    {
      externalId: "eurlex-demo-32025l0412",
      kind: "DYREKTYWA_UE",
      status: "OPUBLIKOWANY",
      title: "Directive (EU) 2025/412 on consumer protection in online marketplaces and distance selling",
      institution: "Unia Europejska",
      url: "https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:32025L0412",
      documentDate: daysAgo(70),
      domainSlugs: ["handel-i-e-commerce"],
    },
  ];
}

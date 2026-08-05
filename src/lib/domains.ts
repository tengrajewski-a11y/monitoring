/**
 * Definicja dziedzin monitoringu i słów kluczowych używanych do automatycznej
 * klasyfikacji dokumentów pobranych z Sejmu, RCL i EUR-Lex.
 *
 * Dodanie nowej dziedziny: dopisz wpis tutaj, uruchom `npm run db:seed`.
 */

export type DomainDefinition = {
  slug: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  order: number;
  keywords: string[];
  /** Angielskie terminy używane do wyszukiwania w EUR-Lex/CELLAR (metadane UE są w j. angielskim). */
  euKeywords: string[];
};

export const DOMAINS: DomainDefinition[] = [
  {
    slug: "energetyka-i-klimat",
    name: "Energetyka i klimat",
    description:
      "Prawo energetyczne, odnawialne źródła energii, transformacja energetyczna, ETS, polityka klimatyczna.",
    color: "#1E6F5C",
    icon: "bolt",
    order: 1,
    keywords: [
      "energi", "energetyczn", "OZE", "odnawialn", "fotowoltaik", "wiatrak",
      "elektrowni", "gaz ziemn", "sieć przesyłow", "klimat", "emisj", "ETS",
      "dekarbonizacj", "wodór", "sieci elektroenergetyczne", "efektywność energetyczna",
      "magazynowanie energii", "ciepłownictwo", "węgiel",
    ],
    euKeywords: ["energy", "renewable", "emissions trading", "climate", "decarbonisation", "hydrogen"],
  },
  {
    slug: "zdrowie-i-farmacja",
    name: "Zdrowie i farmacja",
    description:
      "Prawo farmaceutyczne, refundacja leków, wyroby medyczne, ochrona zdrowia, badania kliniczne.",
    color: "#8E3B46",
    icon: "cross",
    order: 2,
    keywords: [
      "zdrowi", "farmaceut", "lek", "refundacj", "wyrob medyczn", "apteka",
      "aptekarsk", "badania klinicz", "NFZ", "świadczeni zdrowotn", "szpital",
      "pacjent", "epidemi", "sanitarn", "medyczn", "psychoaktywn",
    ],
    euKeywords: ["pharmaceutical", "medicinal product", "medical device", "health", "clinical trial"],
  },
  {
    slug: "cyfryzacja-i-telekomunikacja",
    name: "Cyfryzacja i telekomunikacja",
    description:
      "AI Act, prawo telekomunikacyjne, cyberbezpieczeństwo, ochrona danych osobowych, usługi cyfrowe.",
    color: "#2A4B8D",
    icon: "cpu",
    order: 3,
    keywords: [
      "cyfryzacj", "telekomunikacyjn", "cyberbezpieczeństw", "sztuczn inteligencj",
      "AI Act", "dane osobow", "RODO", "usługi cyfrow", "sieci telekomunikacyjne",
      "łączności elektronicznej", "informatyzacj", "e-usług", "domena internetow",
      "platform cyfrow", "DSA", "DMA", "NIS2", "krajowy system cyberbezpieczeństwa",
    ],
    euKeywords: ["artificial intelligence", "cybersecurity", "digital services", "data protection", "telecommunications", "electronic communications"],
  },
  {
    slug: "handel-i-e-commerce",
    name: "Handel i e-commerce",
    description:
      "Prawo konsumenckie, handel elektroniczny, platformy sprzedażowe, płatności, logistyka handlowa.",
    color: "#B8722A",
    icon: "shopping-bag",
    order: 4,
    keywords: [
      "handel", "handlu", "e-commerce", "sprzedaż", "konsument", "konsumenck",
      "platform sprzedażow", "płatnośc", "reklamacj", "umow zawieran na odległość",
      "handlu detaliczn", "handlu hurtow", "marketplace", "opakowani", "logistyk",
      "sieci handlow", "niedziele handlow", "podatek od sprzedaży detalicznej",
    ],
    euKeywords: ["consumer protection", "electronic commerce", "digital markets", "retail trade", "distance selling"],
  },
];

export function classifyTextToDomainSlugs(text: string): string[] {
  const normalized = text.toLowerCase();
  const matches: string[] = [];
  for (const domain of DOMAINS) {
    const hit = domain.keywords.some((kw) =>
      normalized.includes(kw.toLowerCase()),
    );
    if (hit) matches.push(domain.slug);
  }
  return matches;
}

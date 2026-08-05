/**
 * Konektor do komisji sejmowych i ich posiedzeń, poprzez oficjalne API
 * Sejmu RP (https://api.sejm.gov.pl/).
 *
 * Wykorzystywane endpointy:
 *  - GET /sejm/term{term}/committees                  — lista komisji
 *  - GET /sejm/term{term}/committees/{code}/sittings   — posiedzenia (relacje) danej komisji
 *
 * Podobnie jak inne konektory: parsowanie jest defensywne, a w razie
 * niepowodzenia sieciowego/parsowania zwracane są dane przykładowe
 * (isFallback: true).
 */

const API_BASE = "https://api.sejm.gov.pl";
const CURRENT_TERM = 10;
/** Limit liczby komisji, dla których pobieramy pełną listę posiedzeń (żeby nie robić dziesiątek zapytań na każdy import). */
const MAX_COMMITTEES_WITH_SITTINGS = 12;

type RawCommittee = {
  code?: string;
  name?: string;
  nameGenitive?: string;
  type?: string;
  scope?: string;
  phone?: string;
};

type RawSitting = {
  num?: number;
  date?: string;
  agenda?: string;
  remoteAudioVideoRecording?: { URL?: string } | string;
  closed?: boolean;
};

export type NormalizedCommittee = {
  code: string;
  name: string;
  nameGenitive?: string;
  type?: string;
  scope?: string;
  phone?: string;
};

export type NormalizedSitting = {
  committeeCode: string;
  number: number;
  date?: Date;
  agenda?: string;
  remoteUrl?: string;
};

export type KomisjeResult = {
  committees: NormalizedCommittee[];
  sittings: NormalizedSitting[];
  isFallback: boolean;
  errorMessage?: string;
};

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

function mapCommittee(c: RawCommittee): NormalizedCommittee | null {
  if (!c.code || !c.name) return null;
  return {
    code: c.code,
    name: c.name,
    nameGenitive: c.nameGenitive,
    type: c.type,
    scope: c.scope,
    phone: c.phone,
  };
}

function mapSitting(committeeCode: string, s: RawSitting): NormalizedSitting | null {
  if (s.num == null) return null;
  const remoteUrl =
    typeof s.remoteAudioVideoRecording === "string"
      ? s.remoteAudioVideoRecording
      : s.remoteAudioVideoRecording?.URL;

  return {
    committeeCode,
    number: s.num,
    date: s.date ? new Date(s.date) : undefined,
    agenda: s.agenda,
    remoteUrl,
  };
}

export async function fetchKomisje(): Promise<KomisjeResult> {
  try {
    const rawCommittees = await fetchJson<RawCommittee[]>(
      `${API_BASE}/sejm/term${CURRENT_TERM}/committees`,
    );
    const committees = rawCommittees
      .map(mapCommittee)
      .filter((c): c is NormalizedCommittee => c !== null);

    if (committees.length === 0) {
      throw new Error("API zwróciło pustą listę komisji — prawdopodobna zmiana kontraktu API");
    }

    const sittingsPerCommittee = await Promise.all(
      committees.slice(0, MAX_COMMITTEES_WITH_SITTINGS).map(async (c) => {
        try {
          const raw = await fetchJson<RawSitting[]>(
            `${API_BASE}/sejm/term${CURRENT_TERM}/committees/${c.code}/sittings`,
          );
          return raw
            .map((s) => mapSitting(c.code, s))
            .filter((s): s is NormalizedSitting => s !== null);
        } catch {
          return [] as NormalizedSitting[];
        }
      }),
    );

    return {
      committees,
      sittings: sittingsPerCommittee.flat(),
      isFallback: false,
    };
  } catch (err) {
    const fallback = komisjeFallbackData();
    return {
      ...fallback,
      isFallback: true,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Dane przykładowe używane, gdy API Sejmu jest niedostępne. */
export function komisjeFallbackData(): { committees: NormalizedCommittee[]; sittings: NormalizedSitting[] } {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  const committees: NormalizedCommittee[] = [
    {
      code: "ESK",
      name: "Komisja do Spraw Energii, Klimatu i Aktywów Państwowych",
      nameGenitive: "Komisji do Spraw Energii, Klimatu i Aktywów Państwowych",
      type: "STANDING",
      scope: "Energetyka, transformacja energetyczna, nadzór właścicielski nad spółkami Skarbu Państwa.",
      phone: "22 694 19 34",
    },
    {
      code: "ZDR",
      name: "Komisja Zdrowia",
      nameGenitive: "Komisji Zdrowia",
      type: "STANDING",
      scope: "Ochrona zdrowia, polityka lekowa, system opieki zdrowotnej.",
      phone: "22 694 18 08",
    },
    {
      code: "CNG",
      name: "Komisja Cyfryzacji, Innowacyjności i Nowoczesnych Technologii",
      nameGenitive: "Komisji Cyfryzacji, Innowacyjności i Nowoczesnych Technologii",
      type: "STANDING",
      scope: "Cyfryzacja administracji, cyberbezpieczeństwo, telekomunikacja.",
      phone: "22 694 19 12",
    },
    {
      code: "GOS",
      name: "Komisja Gospodarki i Rozwoju",
      nameGenitive: "Komisji Gospodarki i Rozwoju",
      type: "STANDING",
      scope: "Handel, przedsiębiorczość, prawo konsumenckie.",
      phone: "22 694 18 65",
    },
  ];

  const sittings: NormalizedSitting[] = [
    {
      committeeCode: "ESK",
      number: 42,
      date: daysAgo(6),
      agenda:
        "Rozpatrzenie rządowego projektu ustawy o zmianie ustawy – Prawo energetyczne (druk nr 612).",
      remoteUrl: "https://www.sejm.gov.pl/Sejm10.nsf/transmisje.xsp",
    },
    {
      committeeCode: "ESK",
      number: 41,
      date: daysAgo(20),
      agenda: "Informacja Ministra Klimatu i Środowiska o stanie sieci przesyłowych.",
    },
    {
      committeeCode: "ZDR",
      number: 38,
      date: daysAgo(3),
      agenda: "Pierwsze czytanie poselskiego projektu ustawy o refundacji leków.",
      remoteUrl: "https://www.sejm.gov.pl/Sejm10.nsf/transmisje.xsp",
    },
    {
      committeeCode: "CNG",
      number: 29,
      date: daysAgo(14),
      agenda: "Rozpatrzenie projektu ustawy o krajowym systemie cyberbezpieczeństwa (NIS2).",
    },
    {
      committeeCode: "GOS",
      number: 22,
      date: daysAgo(31),
      agenda: "Rozpatrzenie ustawy o ochronie niektórych praw konsumentów w handlu internetowym.",
    },
  ];

  return { committees, sittings };
}

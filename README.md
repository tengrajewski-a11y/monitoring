# Trinity Trust — Monitoring Legislacyjny

Wewnętrzna aplikacja monitoringu legislacyjnego dla Trinity Trust Corporate
Counsel. Etap 1: monitoring prawa krajowego i unijnego istotnego dla klientów
agencji public affairs, z podziałem na dziedziny.

## Stos technologiczny

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4 — minimalistyczny,
  responsywny interfejs (desktop i mobile)
- **Prisma 7** + SQLite (`better-sqlite3`) — łatwo zmienić na PostgreSQL do
  produkcji (patrz `prisma/schema.prisma` i `prisma.config.ts`)
- **cheerio** — parsowanie stron RCL (brak oficjalnego API)

## Źródła danych

| Źródło | Sposób integracji | Plik |
|---|---|---|
| Sejm RP (api.sejm.gov.pl) | oficjalne REST API (procesy legislacyjne + akty ELI/Dziennik Ustaw) | `src/lib/connectors/sejm.ts` |
| Rządowe Centrum Legislacji | parsowanie HTML list projektów (`/lista?typeId=...`) | `src/lib/connectors/rcl.ts` |
| EUR-Lex / CELLAR | zapytania SPARQL do publicznego endpointu CELLAR | `src/lib/connectors/eurlex.ts` |
| Monitoring mediów | zaplanowany na kolejny etap (model danych już gotowy: `SourceType.MEDIA`) | — |

**Ważne:** to środowisko deweloperskie (sandbox) ma zablokowany dostęp
sieciowy do `api.sejm.gov.pl`, `legislacja.rcl.gov.pl` i `eur-lex.europa.eu`
(polityka sieciowa środowiska). Każdy konektor jest w pełni zaimplementowany
zgodnie z udokumentowanym kontraktem danego źródła, ale **nie został
zweryfikowany na żywo**. Gdy połączenie z API/HTML się nie powiedzie (błąd
sieci, timeout, zmiana struktury odpowiedzi), konektor automatycznie
przełącza się na realistyczne dane przykładowe (`isFallback: true`,
widoczne w UI jako plakietka „dane przykładowe”), więc aplikacja zawsze
pokazuje spójny widok.

**Przed wdrożeniem produkcyjnym** (środowisko z pełnym dostępem do
internetu) należy:
1. Uruchomić `npm run db:seed` lub wywołać `POST /api/ingest` i sprawdzić
   logi (`IngestionLog` w bazie) — czy `status = "success"`, a nie
   `"fallback"`.
2. W razie `"fallback"` sprawdzić `errorMessage` w logu i dostroić:
   - nazwy pól w odpowiedzi JSON Sejmu (`src/lib/connectors/sejm.ts`),
   - selektory CSS dla RCL (`src/lib/connectors/rcl.ts`) — RCL nie ma API,
     więc zmiana wyglądu strony może wymagać aktualizacji selektorów,
   - nazwy predykatów RDF/SPARQL dla EUR-Lex (`src/lib/connectors/eurlex.ts`).

## Dziedziny monitoringu

Zdefiniowane w `src/lib/domains.ts` (pojedyncze źródło prawdy dla nazw,
opisów, kolorów i słów kluczowych klasyfikujących dokumenty):

1. Energetyka i klimat
2. Zdrowie i farmacja
3. Cyfryzacja i telekomunikacja
4. Handel i e-commerce

Dodanie nowej dziedziny: dopisz wpis w `DOMAINS` w `src/lib/domains.ts`,
uruchom `npm run db:seed`.

## Model danych

Zobacz `prisma/schema.prisma`. Kluczowe modele: `Domain`, `MonitoringItem`
(dokument z dowolnego źródła), `ItemDomain` (tagowanie wiele-do-wielu),
`IngestionLog` (historia synchronizacji), oraz `Client`/`ClientDomain`/`User`
— przygotowane pod przyszły portal kliencki (logowanie klientów z widokiem
przefiltrowanym do ich dziedzin), zgodnie z planowanym etapem 2.

## Uruchomienie lokalne

```bash
npm install
npm run db:migrate   # tworzy bazę SQLite i uruchamia migracje
npm run db:seed       # seeduje dziedziny + próbuje pobrać dane ze źródeł
npm run dev
```

Ręczne odświeżenie danych: przycisk „Odśwież dane” na pulpicie, lub
`POST /api/ingest` (opcjonalnie zabezpieczone nagłówkiem
`x-ingest-secret`, jeśli ustawiono zmienną `INGEST_SECRET`).

## Logo

W repozytorium nie ma pliku graficznego logo — sesja robocza nie miała
dostępu do przesłanego obrazu jako pliku, dlatego marka w interfejsie
(`src/components/Logo.tsx`) jest odtworzona typograficznie (szeryfowy
napis „Trinity Trust” + rozstrzelony podpis „Corporate Counsel”), zgodnie
ze stylem przesłanego logo. Aby użyć docelowego pliku graficznego, podmień
zawartość `src/components/Logo.tsx` na `<Image src="/logo.svg" .../>` i
umieść plik w `public/logo.svg` (lub `.png`).

## Plany na kolejny etap

- Monitoring mediów (prasa, portale branżowe, social media)
- Portal kliencki z logowaniem i widokiem przefiltrowanym do dziedzin klienta
- Powiadomienia e-mail/webhook o nowych pozycjach w obserwowanych dziedzinach
- Harmonogram cykliczny (cron) wywołujący `POST /api/ingest`

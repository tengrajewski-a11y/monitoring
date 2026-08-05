# Trinity Trust — Monitoring Legislacyjny

Wewnętrzna aplikacja monitoringu legislacyjnego dla Trinity Trust Corporate
Counsel. Etap 1: monitoring prawa krajowego i unijnego istotnego dla klientów
agencji public affairs, z podziałem na dziedziny.

## Stos technologiczny

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4 — minimalistyczny,
  responsywny interfejs (desktop i mobile)
- **Prisma 7** + **PostgreSQL** (`pg` + `@prisma/adapter-pg`) — gotowe pod
  wdrożenie na Vercel (patrz `prisma/schema.prisma` i `src/lib/db.ts`)
- **cheerio** — parsowanie stron RCL (brak oficjalnego API)

## Wdrożenie na Vercel (krok po kroku)

1. **Baza danych.** Aplikacja potrzebuje bazy PostgreSQL (SQLite nie nadaje
   się do środowiska serverless — dysk nie jest trwały między wywołaniami).
   Najprościej:
   - Wejdź na [vercel.com](https://vercel.com) i zaloguj się kontem GitHub.
   - "Add New… → Project" → wybierz to repozytorium (`monitoring`) → **Deploy**
     (pierwszy build może się nie powieść, bo nie ma jeszcze bazy — to normalne).
   - W panelu projektu wejdź w zakładkę **Storage → Create Database → Postgres**
     (Vercel poprowadzi Cię przez założenie darmowej bazy, np. Neon) i połącz ją
     z projektem — Vercel sam doda zmienną środowiskową `DATABASE_URL`.
2. **Utworzenie tabel w bazie.** Skopiuj wartość `DATABASE_URL` z zakładki
   Storage (albo Settings → Environment Variables) do pliku `.env` na swoim
   komputerze (skopiuj `.env.example` do `.env` i wklej connection string),
   a następnie lokalnie uruchom:
   ```bash
   npm install
   npm run db:push    # tworzy tabele w bazie
   npm run db:seed    # wypełnia dziedziny i przykładowe dane
   ```
3. **Redeploy.** Wróć do Vercela i kliknij **Redeploy** (albo po prostu zrób
   dowolny nowy commit/push) — tym razem build powinien się udać i dostaniesz
   publiczny link, np. `monitoring-xyz.vercel.app`.

Od tej pory każdy `git push` do gałęzi `main` (lub tej, którą podłączysz w
Vercel) automatycznie aktualizuje żywą wersję.

## Źródła danych

| Źródło | Sposób integracji | Plik |
|---|---|---|
| Sejm RP (api.sejm.gov.pl) | oficjalne REST API (procesy legislacyjne, akty ELI z Dziennika Ustaw i Monitora Polskiego) | `src/lib/connectors/sejm.ts` |
| Komisje sejmowe i ich posiedzenia | oficjalne REST API (`/committees`, `/committees/{code}/sittings`) | `src/lib/connectors/komisje.ts` |
| Rządowe Centrum Legislacji | parsowanie HTML list projektów (`/lista?typeId=...`) | `src/lib/connectors/rcl.ts` |
| EUR-Lex / CELLAR | zapytania SPARQL do publicznego endpointu CELLAR | `src/lib/connectors/eurlex.ts` |
| Monitoring mediów | zaplanowany na kolejny etap (model danych już gotowy: `SourceType.MEDIA`) | — |

## Funkcje

- **Pulpit** — przegląd statystyk, ostatniej aktywności i stanu synchronizacji źródeł
- **Monitoring** — pełna lista dokumentów z filtrami (dziedzina/źródło/status) i
  wyszukiwaniem po frazach (dzielone na słowa, każde musi wystąpić — bez
  rozróżniania wielkości liter, przeszukuje tytuł, opis, instytucję i etap)
- **Komisje** — lista komisji sejmowych z relacjami z ostatnich posiedzeń
  (`/komisje`, `/komisje/[kod]`); model danych ma pole na transkrypcję
  (np. z transkrypcji mowy na tekst), gdy ta funkcja zostanie podłączona
- **Alerty** (`/alerty`) — chronologiczny zapis nowych pozycji oraz zmian
  statusu/etapu wykrytych przy kolejnych importach, filtrowalny po dziedzinie
- **Dziedziny** — konfiguracja i przegląd dziedzin monitoringu

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

Wymagana jest baza PostgreSQL — najprościej użyć tej samej, którą założysz
przy okazji wdrożenia na Vercel (patrz sekcja wyżej), albo dowolnej innej
(np. darmowe [Neon](https://neon.tech) lub [Supabase](https://supabase.com)).

```bash
cp .env.example .env   # i wklej tam swój DATABASE_URL
npm install
npm run db:push         # tworzy tabele w bazie
npm run db:seed          # seeduje dziedziny + próbuje pobrać dane ze źródeł
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

- Logowanie i panel administracyjny (role: agencja / klient / admin —
  model `User`/`Client` w schemacie już to przewiduje)
- Powiadomienia e-mail o zmianach z `/alerty` (obecnie tylko w aplikacji;
  wymaga wyboru dostawcy poczty, np. Resend)
- Transkrypcja (speech-to-text) posiedzeń komisji — pole `transcript` w
  modelu `CommitteeSitting` jest już przygotowane
- Korespondencja z klientem (log komunikacji per klient)
- Monitoring mediów (prasa, portale branżowe, social media)
- Harmonogram cykliczny (cron) wywołujący `POST /api/ingest` zamiast
  tylko ręcznego przycisku „Odśwież dane”

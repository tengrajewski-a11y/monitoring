# Trinity Trust — Monitoring Legislacyjny (wersja desktop / Windows)

Aplikacja desktopowa (Windows) do monitoringu legislacyjnego dla Trinity
Trust Corporate Counsel. Etap 1: monitoring prawa krajowego i unijnego
istotnego dla klientów agencji public affairs, z podziałem na dziedziny.

## Dla użytkownika: jak uruchomić

1. W folderze `release/` znajdź plik **`Trinity Trust Monitoring 0.1.0.exe`**.
2. Skopiuj go gdziekolwiek na Windows (10 lub 11) i kliknij dwukrotnie.
   To wersja **portable** — nie wymaga instalacji, sam się rozpakowuje do
   folderu tymczasowego i uruchamia.
3. Przy pierwszym uruchomieniu aplikacja tworzy swoją bazę danych w
   `%APPDATA%\trinity-trust-monitoring\monitoring.db`, wstępnie wypełnioną
   dziedzinami i przykładowymi danymi. Kolejne uruchomienia używają tej
   samej bazy — dane (w tym ręczne odświeżenia) są trwałe między sesjami.
4. Przycisk **"Odśwież dane"** na pulpicie próbuje pobrać świeże dane z
   Sejmu RP, RCL i EUR-Lex (wymaga połączenia z internetem).

Windows Defender/SmartScreen może przy pierwszym uruchomieniu pokazać
ostrzeżenie "Windows chroniło Twój komputer" — to normalne dla aplikacji
niepodpisanych certyfikatem wydawcy (podpisywanie kodu to płatna usługa).
Kliknij **"Więcej informacji" → "Uruchom mimimo to"**.

## Stos technologiczny

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4 — interfejs
- **Electron** — natywna powłoka desktopowa (Windows), uruchamia lokalnie
  zbudowany serwer Next.js (`output: "standalone"`) i otwiera go w oknie
- **Prisma 7** + **SQLite** (`better-sqlite3`, biblioteka N-API — działa
  bez przebudowy pod konkretną wersję Node/Electron) — baza lokalna,
  trzymana w katalogu danych użytkownika, działa w pełni offline
- **cheerio** — parsowanie stron RCL (brak oficjalnego API)

## Budowanie instalatora samodzielnie

```bash
npm install
npm run dist
```

To polecenie: buduje Next.js w trybie `standalone`, dokłada `public/` i
statyki, po czym electron-builder pakuje wszystko w `release/` jako
przenośny plik `.exe` (target `portable` w konfiguracji `build.win` w
`package.json`). Budowa była testowana i weryfikowana w środowisku Linux
(z zainstalowanym `wine64` — potrzebnym tylko do etapu podpisywania/pakowania
NSIS; sam plik wynikowy nie wymaga Wine do uruchomienia, bo to zwykły
plik `.exe`). Jeśli wolisz zbudować to na prawdziwym Windows albo przez
GitHub Actions (`windows-latest`), zadziała identycznie — `npm run dist`
jest platformowo niezależne.

### Jak to działa pod spodem

- `electron/main.js` — proces główny Electron: przy starcie kopiuje
  szablonową bazę (`electron/resources/template.db`) do katalogu danych
  użytkownika (jeśli jeszcze nie istnieje), uruchamia `server.js`
  (zbudowany standalone serwer Next.js) jako podproces z odpowiednim
  `DATABASE_URL`, czeka aż odpowie, i otwiera okno wskazujące na
  `http://127.0.0.1:4317`.
- `scripts/prepare-electron.js` — po `next build` dokłada `public/` i
  `.next/static/` do `.next/standalone/` (Next.js świadomie ich tam nie
  kopiuje) oraz usuwa artefakty cache'u tracingu, które psują pakowanie.
- `scripts/after-pack.js` (hook `afterPack` electron-buildera) — kopiuje
  cały `.next/standalone` (razem z prawdziwym `node_modules`, w tym
  natywnym plikiem `better-sqlite3/prebuilds/win32-x64.node`) do
  spakowanej aplikacji. Zrobione ręcznie, bo domyślna obsługa
  `extraResources` w electron-builderze przy tym projekcie gubiła
  zależności natywne.

## Źródła danych

| Źródło | Sposób integracji | Plik |
|---|---|---|
| Sejm RP (api.sejm.gov.pl) | oficjalne REST API (procesy legislacyjne + akty ELI/Dziennik Ustaw) | `src/lib/connectors/sejm.ts` |
| Rządowe Centrum Legislacji | parsowanie HTML list projektów (`/lista?typeId=...`) | `src/lib/connectors/rcl.ts` |
| EUR-Lex / CELLAR | zapytania SPARQL do publicznego endpointu CELLAR | `src/lib/connectors/eurlex.ts` |
| Monitoring mediów | zaplanowany na kolejny etap (model danych już gotowy: `SourceType.MEDIA`) | — |

Gdy połączenie z API/HTML się nie powiedzie (brak internetu, zmiana
struktury odpowiedzi), każdy konektor automatycznie przełącza się na
realistyczne dane przykładowe (`isFallback: true`, widoczne w UI jako
plakietka „dane przykładowe”), więc aplikacja zawsze pokazuje spójny widok.

## Dziedziny monitoringu

Zdefiniowane w `src/lib/domains.ts` (pojedyncze źródło prawdy dla nazw,
opisów, kolorów i słów kluczowych klasyfikujących dokumenty):

1. Energetyka i klimat
2. Zdrowie i farmacja
3. Cyfryzacja i telekomunikacja
4. Handel i e-commerce

Dodanie nowej dziedziny: dopisz wpis w `DOMAINS` w `src/lib/domains.ts`,
zregeneruj szablon bazy (`npm run db:seed`, potem skopiuj `dev.db` do
`electron/resources/template.db`) i przebuduj (`npm run dist`).

## Model danych

Zobacz `prisma/schema.prisma`. Kluczowe modele: `Domain`, `MonitoringItem`
(dokument z dowolnego źródła), `ItemDomain` (tagowanie wiele-do-wielu),
`IngestionLog` (historia synchronizacji), oraz `Client`/`ClientDomain`/`User`
— przygotowane pod przyszły portal kliencki, gdyby wrócono do wersji web.

## Rozwój lokalny (bez Electrona, sam Next.js w przeglądarce)

```bash
cp .env.example .env
npm install
npm run db:migrate   # tworzy lokalną bazę SQLite (dev.db) i uruchamia migracje
npm run db:seed      # seeduje dziedziny + próbuje pobrać dane ze źródeł
npm run dev
```

## Logo

W repozytorium nie ma pliku graficznego logo — marka w interfejsie
(`src/components/Logo.tsx`) jest odtworzona typograficznie (szeryfowy
napis „Trinity Trust” + rozstrzelony podpis „Corporate Counsel”). Aby użyć
docelowego pliku graficznego, podmień `src/components/Logo.tsx` i dodaj
plik do `public/`.

## Plany na kolejny etap

- Monitoring mediów (prasa, portale branżowe, social media)
- Ikona aplikacji (obecnie domyślna ikona Electrona)
- Podpisywanie kodu (certyfikat wydawcy), żeby zniknęło ostrzeżenie SmartScreen
- Automatyczne odświeżanie danych w tle (harmonogram) zamiast tylko ręcznego przycisku

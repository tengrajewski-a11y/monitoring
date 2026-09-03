# Trinity Trust — Monitoring Legislacyjny

Wewnętrzna aplikacja monitoringu legislacyjnego dla Trinity Trust Corporate
Counsel. Etap 1: monitoring prawa krajowego i unijnego istotnego dla klientów
agencji public affairs, z podziałem na dziedziny.

## Stos technologiczny

- **Next.js 16** (App Router) + TypeScript + Tailwind CSS 4 — minimalistyczny,
  responsywny interfejs (desktop i mobile)
- **Prisma 7** + **PostgreSQL** (`pg` + `@prisma/adapter-pg`) — gotowe pod
  wdrożenie na Vercel albo samodzielny VPS (patrz `prisma/schema.prisma`
  i `src/lib/db.ts`)
- **cheerio** — parsowanie stron RCL (brak oficjalnego API)

## Wdrożenie na Vercel (krok po kroku)

1. **Baza danych.** Aplikacja potrzebuje bazy PostgreSQL (SQLite nie nadaje
   się do środowiska serverless — dysk nie jest trwały między wywołaniami).
   Najprościej:
   - Wejdź na [vercel.com](https://vercel.com) i zaloguj się kontem GitHub.
   - "Add New… → Project" → wybierz to repozytorium (`monitoring`) → **Deploy**
     (pierwszy build może się nie powieść, bo nie ma jeszcze bazy/sekretu — to normalne).
   - W panelu projektu wejdź w zakładkę **Storage → Create Database → Postgres**
     (Vercel poprowadzi Cię przez założenie darmowej bazy, np. Neon) i połącz ją
     z projektem — Vercel sam doda zmienną środowiskową `DATABASE_URL`.
   - W zakładce **Settings → Environment Variables** dodaj `AUTH_SECRET`
     (dowolny losowy, długi ciąg znaków — np. wygenerowany poleceniem
     `openssl rand -base64 32` na swoim komputerze). Bez tego logowanie nie zadziała.
2. **Utworzenie tabel w bazie i konta administratora.** Skopiuj wartość
   `DATABASE_URL` z zakładki Storage (albo Settings → Environment Variables)
   do pliku `.env` na swoim komputerze (skopiuj `.env.example` do `.env` i
   wklej connection string oraz ten sam `AUTH_SECRET`), a następnie lokalnie
   uruchom:
   ```bash
   npm install
   npm run db:push    # tworzy tabele w bazie
   npm run db:seed    # wypełnia dziedziny, przykładowe dane i konto administratora
   ```
   `db:seed` wypisze w konsoli e-mail i hasło startowego konta administratora
   (`admin@trinity-trust.pl`, chyba że ustawisz własny `ADMIN_EMAIL` w `.env`
   przed seedowaniem) — zapisz je, nie da się ich później podejrzeć.
3. **Redeploy.** Wróć do Vercela i kliknij **Redeploy** (albo po prostu zrób
   dowolny nowy commit/push) — tym razem build powinien się udać i dostaniesz
   publiczny link, np. `monitoring-xyz.vercel.app`.
4. **Zaloguj się** pod `/login` danymi z kroku 2. Jako administrator masz
   dostęp do zakładki „Panel admina" (`/panel-admina`) — tam dodasz kolejnych
   użytkowników zespołu, klientów i skonfigurujesz dziedziny.

Od tej pory każdy `git push` do gałęzi `main` (lub tej, którą podłączysz w
Vercel) automatycznie aktualizuje żywą wersję.

## Samodzielny hosting na VPS (np. home.pl) zamiast Vercela

**Ważne, sprawdzone przy tym projekcie:** zwykły hosting współdzielony
home.pl (Business/Professional/Premium — ten z panelem klienta i bazami
MySQL/PostgreSQL "z automatu") **nie obsługuje aplikacji Node.js** —
obsługuje tylko PHP, Perl i Python. Ta aplikacja (Next.js) tam nie
zadziała, niezależnie od konfiguracji. Node.js w home.pl działa wyłącznie
na usłudze **VPS Linux** (własny system Ubuntu/Debian, dostęp root przez
SSH) — od ok. 45 zł netto/mies. (czasem promocje od kilku zł/mies. przy
płatności rocznej). To jedyny sposób, żeby "hostować na własnym serwerze"
tę aplikację w home.pl. Poniższa instrukcja dotyczy VPS Linux (Ubuntu
22.04/24.04) — zadziała identycznie na VPS w dowolnej innej firmie.

1. **Zamów VPS Linux** w home.pl z systemem Ubuntu 24.04 (lub Debian 12).
   Po ok. 15 minutach dostaniesz dane do logowania SSH (adres IP,
   użytkownik, hasło/klucz).
2. **Zaloguj się przez SSH** (z Windows: PuTTY albo `ssh` w Terminalu
   Windows 11; z Mac/Linux: `ssh root@adres-ip-vps`).
3. **Zainstaluj wymagane oprogramowanie** (jednorazowo):
   ```bash
   apt update && apt upgrade -y
   # Node.js 22 LTS
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
   apt install -y nodejs git nginx postgresql postgresql-contrib
   npm install -g pm2
   ```
4. **Utwórz bazę danych PostgreSQL** na VPS:
   ```bash
   sudo -u postgres psql -c "CREATE USER monitoring WITH PASSWORD 'wymysl-haslo';"
   sudo -u postgres psql -c "CREATE DATABASE monitoring OWNER monitoring;"
   ```
   Connection string do `.env`: `postgresql://monitoring:wymysl-haslo@localhost:5432/monitoring`
   (jeśli wolisz użyć bazy PostgreSQL już dostępnej w Twoim koncie
   hostingowym home.pl zamiast instalować własną — zapytaj wsparcie
   home.pl, czy ta baza przyjmuje połączenia spoza ich sieci wewnętrznej;
   często bazy na hostingu współdzielonym są dostępne tylko lokalnie).
5. **Pobierz kod z GitHub:**
   ```bash
   cd /var/www
   git clone https://github.com/TWOJ-LOGIN/monitoring.git
   cd monitoring
   cp .env.example .env
   nano .env   # wklej DATABASE_URL z kroku 4, AUTH_SECRET (openssl rand -base64 32), opcjonalnie OPENAI_API_KEY
   ```
6. **Zainstaluj, zbuduj i uruchom:**
   ```bash
   npm ci
   npm run db:push
   npm run db:seed    # zapisz wypisany e-mail/hasło administratora
   npm run build
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup        # ustawia autostart po restarcie serwera — wykonaj polecenie, które PM2 wypisze
   ```
7. **Skonfiguruj Nginx** (reverse proxy z portu 80/443 na aplikację
   działającą na porcie 3000) — użyj szablonu `deploy/nginx.conf.example`:
   ```bash
   cp deploy/nginx.conf.example /etc/nginx/sites-available/monitoring
   nano /etc/nginx/sites-available/monitoring   # podmień twojadomena.pl na swoją domenę
   ln -s /etc/nginx/sites-available/monitoring /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```
8. **Podepnij domenę** — w panelu klienta home.pl (albo tam, gdzie masz
   zarejestrowaną domenę) ustaw rekord DNS **A** wskazujący na adres IP VPS.
9. **Włącz HTTPS** (Let's Encrypt, darmowe, automatyczne odnawianie):
   ```bash
   apt install -y certbot python3-certbot-nginx
   certbot --nginx -d twojadomena.pl -d www.twojadomena.pl
   ```

**Kolejne wdrożenia po zmianach w kodzie** (na VPS, w katalogu repo):
```bash
bash deploy/deploy.sh
```
Ten skrypt sam pobiera zmiany z GitHuba, instaluje zależności, synchronizuje
bazę, buduje aplikację i bezprzestojowo przeładowuje proces PM2.

## Logowanie i panel administracyjny

Cała aplikacja (poza `/login`) wymaga zalogowania — wymusza to `src/proxy.ts`
(odpowiednik dawnego `middleware.ts` w Next.js 16). Sesja to podpisany token
JWT (biblioteka `jose`) w ciasteczku httpOnly, bez zewnętrznych usług
logowania (żadnych kluczy Google/OAuth do skonfigurowania).

- **Role:** `ADMIN` (pełny dostęp + panel administracyjny), `AGENCY` (zespół
  agencji, korzysta z aplikacji bez dostępu do panelu), `CLIENT` (na razie
  tylko w modelu danych — portal kliencki z widokiem przefiltrowanym do
  własnych dziedzin to kolejny etap).
- **Panel admina** (`/panel-admina`, tylko rola `ADMIN`):
  - *Użytkownicy* — tworzenie kont (hasło startowe generowane losowo i
    pokazywane raz przy tworzeniu), zmiana roli, włączanie/wyłączanie konta.
  - *Klienci* — dodawanie klientów i przypisywanie im interesujących dziedzin
    (fundament pod przyszły portal kliencki).
  - *Dziedziny* — edycja nazwy, opisu, koloru i widoczności (słowa kluczowe
    do klasyfikacji nadal edytuje się w `src/lib/domains.ts`).
- Hasła są hashowane (`bcryptjs`), nigdy nie są przechowywane ani wyświetlane
  w postaci jawnej poza jednorazowym komunikatem tuż po utworzeniu konta.

## Transkrypcja posiedzeń komisji

Na stronie `/komisje/[kod]` zespół agencji (role `AGENCY`/`ADMIN`) może dla
każdego posiedzenia:

- **Wgrać plik audio z nagrania** — jest automatycznie transkrybowany przez
  [OpenAI Whisper API](https://platform.openai.com/docs/api-reference/audio)
  (wymaga zmiennej środowiskowej `OPENAI_API_KEY`; koszt ok. 0,006 USD za
  minutę nagrania). Limit Whisper API to 25 MB na plik — dłuższe nagrania
  dziel na fragmenty i wgrywaj po kolei, każdy dopisuje się do transkrypcji.
- **Wkleić/poprawić tekst ręcznie** — działa zawsze, niezależnie od tego, czy
  `OPENAI_API_KEY` jest ustawiony; przydatne też do poprawek po transkrypcji AI.

Bez klucza `OPENAI_API_KEY` aplikacja jasno komunikuje, że automatyczna
transkrypcja jest wyłączona, i pozwala korzystać tylko z opcji ręcznej —
funkcja nie blokuje działania reszty aplikacji.

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
  (`/komisje`, `/komisje/[kod]`), z transkrypcją: automatyczną (wgrywasz plik
  audio z nagrania, transkrybuje go OpenAI Whisper) albo ręczną (wklejasz
  gotowy tekst) — widoczne dla zespołu agencji i administratorów
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
cp .env.example .env   # i wklej tam swój DATABASE_URL oraz AUTH_SECRET
npm install
npm run db:push         # tworzy tabele w bazie
npm run db:seed          # seeduje dziedziny, dane przykładowe i konto administratora
npm run dev
```

Zaloguj się pod `http://localhost:3000/login` danymi wypisanymi przez
`db:seed` w konsoli.

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

- Portal kliencki (rola `CLIENT`) z widokiem przefiltrowanym do dziedzin
  klienta — logowanie i model danych już gotowe, brakuje samego widoku
- Powiadomienia e-mail o zmianach z `/alerty` (obecnie tylko w aplikacji;
  wymaga wyboru dostawcy poczty, np. Resend)
- Korespondencja z klientem (log komunikacji per klient)
- Monitoring mediów (prasa, portale branżowe, social media)
- Harmonogram cykliczny (cron) wywołujący `POST /api/ingest` zamiast
  tylko ręcznego przycisku „Odśwież dane”

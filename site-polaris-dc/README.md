# Polaris Data Center — landing page

Statyczna strona informacyjna o inwestycji Polaris Data Center w Piasecznie
(fakty, harmonogram, wizualizacje, sekcja „Fakty i mity" oraz FAQ).

## Technologia

Zwykły HTML + CSS + odrobina vanilla JS (menu mobilne, lightbox do
wizualizacji, akordeon FAQ). Brak frameworków, brak kroku budowania — to
celowe, żeby strona działała na dowolnym zwykłym hostingu (współdzielony
PHP/Apache/Nginx), bez wymogu Node.js.

## Struktura

```
site-polaris-dc/
├── index.html          # cała strona (treść + style + skrypt)
└── assets/
    ├── wizualizacja-1.jpg
    ├── wizualizacja-2.jpg
    └── wizualizacja-3.jpg
```

## Wdrożenie

Wystarczy skopiować zawartość tego folderu (przez FTP/panel hostingu) do
katalogu głównego domeny (np. `public_html/`). Strona nie wymaga bazy
danych ani backendu.

## Podgląd lokalny

```bash
cd site-polaris-dc
python3 -m http.server 8080
# otwórz http://localhost:8080
```

## Przywracanie zakładki „O firmie”

Zakładka „O firmie” jest tymczasowo ukryta (schowana w komentarzach HTML,
nie usunięta). Docelowo warto ją uzupełnić o materiały merytoryczne
Polskiego Stowarzyszenia Centrów Danych (PSCD) zamiast/obok obecnego opisu.

Aby ją przywrócić, otwórz `index.html` w edytorze tekstu i zmień 3 miejsca:

1. **Link w menu na komputery** — znajdź linię:
   ```html
   <!-- <a href="#o-firmie">O firmie</a> -->
   ```
   i usuń znaczniki komentarza `<!--` oraz `-->` dookoła niej (linijkę
   wyżej z opisem możesz zostawić lub usunąć).

2. **Link w menu mobilnym** — znajdź linię:
   ```html
   <!-- <a href="#o-firmie" style="padding:12px 0;border-bottom:1px solid var(--line);">O firmie</a> -->
   ```
   i tak samo usuń `<!--` oraz `-->`.

3. **Cała sekcja „O firmie”** — znajdź blok zaczynający się od:
   ```html
   <!-- ============================================================
        SEKCJA "O FIRMIE" — UKRYTA NA ŻYCZENIE.
   ```
   i kończący się linią:
   ```html
   END SEKCJA O FIRMIE -->
   ```
   Usuń **tylko** te dwie linie — otwierającą komentarz (`<!-- ====...`)
   i zamykającą (`END SEKCJA O FIRMIE -->`) — a treść sekcji pomiędzy
   nimi zostaw bez zmian.

4. **Tła sekcji (naprzemienność jasny/szary pas)** — po przywróceniu
   sekcji „O firmie” zamień klasy `class="section-alt"` w kolejnych
   sekcjach, żeby pasy tła znów się ładnie przeplatały:
   - `#harmonogram` → usuń `class="section-alt"`
   - `#wizualizacje` → dodaj `class="section-alt"`
   - `#fakty-i-mity` → usuń `class="section-alt"`
   - `#faq` → dodaj `class="section-alt"`
   - `#kontakt` → usuń `class="section-alt"`

   (Sama sekcja `#o-firmie` już ma `class="section-alt"` wpisane od razu.)

Zapisz plik i odśwież stronę — to wszystko, żadnego builda ani serwera
nie trzeba restartować.

## Baner cookies

Na dole strony pokazuje się baner zgody na pliki cookies. Wybór użytkownika
zapisuje się w `localStorage` pod kluczem `sienreal-cookie-consent`
(wartość `all` albo `necessary`) wraz z datą w `sienreal-cookie-consent-date`.
Baner nie pojawia się ponownie, dopóki wybór jest zapisany. Link
„Ustawienia cookies" w stopce otwiera go z powrotem, żeby można było
zmienić decyzję.

Strona sama z siebie nie ustawia żadnych cookies analitycznych. Jeśli
w przyszłości dojdzie np. Google Analytics albo Matomo, kod należy wkleić
w `index.html` w miejscu oznaczonym komentarzem:

```js
if (value === 'all') {
  // MIEJSCE NA SKRYPTY ANALITYCZNE (np. Google Analytics, Matomo).
}
```

Dzięki temu skrypt uruchomi się dopiero po zgodzie użytkownika. Dodatkowo
po każdej decyzji strona wysyła zdarzenie `cookie-consent`
(`document.addEventListener('cookie-consent', ...)`), a aktualny wybór jest
dostępny w `window.sienrealConsent`.

**Uwaga o czcionkach.** Strona pobiera kroje Inter i Inter Tight z serwerów
Google Fonts, co oznacza przekazanie adresu IP odwiedzającego do Google.
Jeżeli chcecie tego uniknąć, czcionki można pobrać raz i wgrać na serwer
razem ze stroną (wtedy działa ona w pełni bez zewnętrznych połączeń).

## Aktualizacja treści

Wszystkie dane liczbowe i harmonogram pochodzą z komunikatu o rozpoczęciu
prac przygotowawczych (24 lipca 2026 r.). W miarę postępu inwestycji warto
zaktualizować sekcję „Harmonogram" i kartę inwestycji w `index.html`.

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

## Aktualizacja treści

Wszystkie dane liczbowe i harmonogram pochodzą z komunikatu o rozpoczęciu
prac przygotowawczych (24 lipca 2026 r.). W miarę postępu inwestycji warto
zaktualizować sekcję „Harmonogram" i kartę inwestycji w `index.html`.

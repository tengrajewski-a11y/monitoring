# Własne modele stworzeń

Tu trafiają modele wygenerowane przez `tools/local_generate.py` (TripoSR / TRELLIS.2, lokalnie na GPU)
albo `tools/meshy_generate.py` (Meshy AI, w chmurze). Każdy wpis w `manifest.json` podmienia model
danego typu stworzenia (klucze z `server/data/monsters.js`), np.:

```json
{ "dragon": { "file": "dragon.glb", "height": 2.0, "rotY": 0, "rotX": 0 } }
```

`height` – wysokość w kratkach, `rotY`/`rotX` – korekta obrotu w stopniach (model powinien patrzeć w +Z).

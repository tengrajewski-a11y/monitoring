# Credits and licences

## 3D models (CC0 1.0)

Created by **Kay Lousberg** – <https://kaylousberg.com> – distributed as CC0 (public domain).
Repacked and partly recoloured by `tools/build-assets.mjs` and `client/js/assets.js`:

- KayKit Character Pack: Adventurers 1.0
- KayKit Character Pack: Skeletons 1.0
- KayKit Dungeon Remastered 1.0
- KayKit Halloween Bits 1.0
- KayKit Medieval Hexagon Pack 1.0
- KayKit Furniture Bits 1.0
- KayKit Restaurant Bits 1.0

## Sound effects (CC0 1.0)

From **Kenney** starter kits (<https://kenney.nl>, assets marked CC0 in their READMEs):
Starter-Kit-3D-Platformer (coin, break), Starter-Kit-FPS (footsteps), Starter-Kit-City-Builder
(placement, toggle, town ambience), Starter-Kit-Racing (impact).

## Music, ambience and the remaining sound effects

Original compositions and sounds for Fibula 3D, rendered from code by `tools/synth.mjs` and
`tools/compose-audio.mjs` (no samples).

## Code libraries

- three.js – MIT – <https://threejs.org>
- ws – MIT – <https://github.com/websockets/ws>
- glTF-Transform (development only) – MIT – <https://gltf-transform.dev>

## Fonts

Pixelify Sans and VT323 – SIL Open Font License 1.1 – loaded from Google Fonts.

## AI-generated creature models

The creature models in `client/assets/models/custom/` were made for Fibula 3D: concept pictures
(`concept/`) generated with LCM Dreamshaper v7 (MIT, <https://huggingface.co/SimianLuo/LCM_Dreamshaper_v7>),
turned into meshes with TripoSR (MIT) by `tools/local_generate.py`. Prompts and settings are listed
in `concept/README.md`.

## Orc and troll models

`client/assets/models/custom/orc*.glb` and `*troll*.glb` are decimated, recoloured versions of a
troll model supplied by the project owner (`Troll.obj`, exported from Blender 2.93); original author
and licence to be confirmed by the owner. Conversion: `tools/troll/`.

## Optional AI model generators (not bundled)

- TripoSR – MIT – Tripo AI & Stability AI – <https://github.com/VAST-AI-Research/TripoSR>
- TRELLIS.2 – MIT – Microsoft – <https://github.com/microsoft/TRELLIS.2>
- Meshy AI – commercial API; check the licence of your plan before publishing generated models.

## Game rules reference

Game mechanics (formulas and rules) were studied from a decompiled 7.72 server provided by the
project owner and re-implemented from scratch. No code, maps, sprites or data from that server
or from CipSoft's games are included.

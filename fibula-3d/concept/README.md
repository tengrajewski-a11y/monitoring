# Concept pictures of the custom creature models

Each picture was generated with `tools/concept_generate.py` (LCM Dreamshaper v7, MIT) and turned
into `client/assets/models/custom/<key>.glb` with `tools/local_generate.py` (TripoSR, MIT,
`--resolution 256`). The prompt is the description below followed by the style text in
`concept_generate.py`; the seed picks the variant. `rotY` (in the models' `manifest.json`) was
set with `/dev/custom.html?top` so that each creature looks the way it walks.

| Creature | Description | Seed | Height | Faces | rotY |
| --- | --- | --- | --- | --- | --- |
| rat | a grey brown rat with dark fur and a long thin tail, walking on all four legs, side view | 8002 | 0.35 | 2500 | 75 |
| rabbit | a cute brown wild rabbit with long ears, sitting on its hind legs | 7723 | 0.45 | 3000 | 20 |
| wolf | a grey wolf monster with dark back fur and a pale belly, standing on all four legs | 7722 | 0.75 | 3000 | 60 |
| deer | a brown deer stag with antlers, standing on four legs | 7722 | 1.1 | 3000 | -60 |
| bear | a big brown grizzly bear walking on all four paws, side view | 8001 | 1.0 | 3500 | 60 |
| poison_spider | a green poisonous spider with eight legs and yellow markings | 7722 | 0.4 | 3000 | 0 |
| giant_spider | a huge black giant spider with dark red markings and eight thick legs | 7723 | 0.8 | 4000 | 0 |
| slime | a glossy green slime blob monster with two eyes | 7721 | 0.6 | 3000 | 40 |
| dragon_hatchling | a small green baby dragon with little wings, standing on four legs | 7721 | 1.0 | 4000 | 60 |
| dragon | a large red dragon with big folded wings, standing on four legs | 7721 | 2.0 | 5000 | 60 |

The snake and the bat keep their procedural models: the generated snakes had legs or came out as
a knot, and a static bat model would sit on the ground instead of flying.

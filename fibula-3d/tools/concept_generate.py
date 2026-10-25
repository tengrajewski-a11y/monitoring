#!/usr/bin/env python3
"""Concept pictures of creatures for tools/local_generate.py, made on your own
machine with LCM Dreamshaper v7 (MIT licence, ~0.9 B parameters, 6 steps;
about 25 s per picture on a 4-core CPU, a second or two on a GPU).

    pip install torch diffusers transformers accelerate
    python tools/concept_generate.py wolf "a grey wolf with a pale belly, standing on all four legs" --variants 4

Writes concept/<key>-<n>.jpg. Pick the clearest one (whole body, three-quarter
view) and turn it into a model:

    python tools/local_generate.py wolf concept/wolf-2.jpg --repo ~/TripoSR --height 0.75
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STYLE = ("single creature, full body, three-quarter view from slightly above, stylized low poly 3d game figurine, "
         "chunky simple shapes, bold flat colors, soft even studio lighting, centered, whole body visible, "
         "plain white background")
# world objects (statues, wells...) for models marked "prop" in the manifest
STYLE_PROP = ("single object, three-quarter view from slightly above, stylized low poly 3d game asset, "
              "chunky simple shapes, bold flat colors, soft even studio lighting, centered, whole object visible, "
              "plain white background")


def main():
    ap = argparse.ArgumentParser(description="Concept pictures for Fibula 3D creatures (LCM Dreamshaper v7)")
    ap.add_argument("key", help="creature type, e.g. wolf, bear, dragon (used for the file names)")
    ap.add_argument("description", help='what to draw, e.g. "a brown bear standing on all four legs"')
    ap.add_argument("--variants", type=int, default=4)
    ap.add_argument("--seed", type=int, default=7720, help="seed of the first variant; the next ones count up")
    ap.add_argument("--out", default=str(ROOT / "concept"))
    ap.add_argument("--style", choices=["creature", "prop"], default="creature")
    args = ap.parse_args()
    if not args.key.replace("_", "").isalnum():
        sys.exit("Creature key may only contain letters, digits and underscores.")

    import torch
    from diffusers import DiffusionPipeline

    device = "cuda" if torch.cuda.is_available() else "cpu"
    pipe = DiffusionPipeline.from_pretrained("SimianLuo/LCM_Dreamshaper_v7", safety_checker=None,
                                             torch_dtype=torch.float16 if device == "cuda" else torch.float32).to(device)
    pipe.set_progress_bar_config(disable=True)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    prompt = f"{args.description}, {STYLE_PROP if args.style == 'prop' else STYLE}"
    for i in range(args.variants):
        seed = args.seed + i
        image = pipe(prompt, num_inference_steps=6, guidance_scale=8.0, width=512, height=512,
                     generator=torch.Generator(device).manual_seed(seed)).images[0]
        path = out / f"{args.key}-{i}.jpg"
        image.save(path, quality=92)
        print(f"{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path}  (seed {seed})")


if __name__ == "__main__":
    main()

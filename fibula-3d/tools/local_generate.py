#!/usr/bin/env python3
"""Generate a creature model from a picture with an open-source image-to-3D
model running on your own GPU, and plug it into Fibula 3D.

Backends (both MIT licensed):
  triposr  - VAST-AI-Research/TripoSR. Fast, ~6 GB VRAM. Vertex coloured mesh.
  trellis2 - microsoft/TRELLIS.2 (4B). Linux + NVIDIA GPU with >= 24 GB VRAM.
             Textured mesh with high-quality geometry.

Setup (once): clone the backend repository and install it as described in its
README, then run this script with that environment's Python, pointing --repo at
the clone:

    git clone https://github.com/VAST-AI-Research/TripoSR ~/TripoSR
    pip install -r ~/TripoSR/requirements.txt
    python tools/local_generate.py wolf concept/wolf.png --backend triposr --repo ~/TripoSR --height 0.8

    git clone -b main https://github.com/microsoft/TRELLIS.2 --recursive ~/TRELLIS.2
    (cd ~/TRELLIS.2 && . ./setup.sh --new-env --basic --flash-attn --nvdiffrast --nvdiffrec --cumesh --o-voxel --flexgemm)
    python tools/local_generate.py dragon concept/dragon.png --backend trellis2 --repo ~/TRELLIS.2 --height 2.0

The GLB is written to client/assets/models/custom/<key>.glb and registered in
client/assets/models/custom/manifest.json. <key> is a creature type from
server/data/monsters.js (rat, wolf, orc, dragon, lich, ...). Reload the game to
see it. Tips: use a clean picture of a single creature on a plain background,
facing the camera; keep polycount low for the retro look; use --rot to make the
model face +Z (towards the camera in the default view).
"""

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "client" / "assets" / "models" / "custom"


def run_triposr(image_path, out, args):
    import numpy as np
    import rembg
    import torch
    from PIL import Image
    from tsr.system import TSR
    from tsr.utils import remove_background, resize_foreground, to_gradio_3d_orientation

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    model = TSR.from_pretrained("stabilityai/TripoSR", config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(8192)
    model.to(device)
    # same preprocessing as TripoSR's run.py
    image = remove_background(Image.open(image_path), rembg.new_session())
    image = resize_foreground(image, 0.85)
    image = np.array(image).astype(np.float32) / 255.0
    image = image[:, :, :3] * image[:, :, 3:4] + (1 - image[:, :, 3:4]) * 0.5
    image = Image.fromarray((image * 255.0).astype(np.uint8))
    with torch.no_grad():
        scene_codes = model([image], device=device)
    mesh = model.extract_mesh(scene_codes, True, resolution=args.resolution)[0]
    mesh = to_gradio_3d_orientation(mesh)  # Y-up like glTF
    if args.faces and len(mesh.faces) > args.faces:
        try:
            mesh = mesh.simplify_quadric_decimation(face_count=args.faces)
        except Exception as e:  # trimesh needs fast-simplification for this
            print(f"  (skipping decimation: {e})")
    mesh.export(out)


def run_trellis2(image_path, out, args):
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    from PIL import Image
    import o_voxel
    from trellis2.pipelines import Trellis2ImageTo3DPipeline

    pipeline = Trellis2ImageTo3DPipeline.from_pretrained("microsoft/TRELLIS.2-4B")
    pipeline.cuda()
    mesh = pipeline.run(Image.open(image_path))[0]
    mesh.simplify(16777216)  # nvdiffrast limit (from the official example)
    glb = o_voxel.postprocess.to_glb(
        vertices=mesh.vertices, faces=mesh.faces, attr_volume=mesh.attrs, coords=mesh.coords,
        attr_layout=mesh.layout, voxel_size=mesh.voxel_size, aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
        decimation_target=args.faces or 20000, texture_size=args.texture, remesh=True, remesh_band=1,
        remesh_project=0, verbose=True,
    )
    glb.export(str(out))


def main():
    ap = argparse.ArgumentParser(description="Image to 3D for Fibula 3D creatures (TripoSR / TRELLIS.2)")
    ap.add_argument("key", help="creature type to replace, e.g. dragon, wolf, orc")
    ap.add_argument("image", help="input picture (PNG/JPG)")
    ap.add_argument("--backend", choices=["triposr", "trellis2"], default="triposr")
    ap.add_argument("--repo", help="path to the cloned backend repository (added to sys.path)")
    ap.add_argument("--height", type=float, default=1.0, help="height of the model in tiles")
    ap.add_argument("--rot", type=float, default=0.0, help="extra rotation around Y in degrees")
    ap.add_argument("--rot-x", type=float, default=0.0, help="extra rotation around X in degrees (fix lying models)")
    ap.add_argument("--faces", type=int, default=8000, help="target face count (low poly suits the retro look)")
    ap.add_argument("--resolution", type=int, default=192, help="TripoSR marching cubes resolution")
    ap.add_argument("--texture", type=int, default=512, help="TRELLIS.2 texture size")
    args = ap.parse_args()

    if not args.key.replace("_", "").isalnum():
        sys.exit("Creature key may only contain letters, digits and underscores.")
    if args.repo:
        sys.path.insert(0, str(Path(args.repo).expanduser().resolve()))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{args.key}.glb"
    print(f"Generating {args.key} with {args.backend}...")
    if args.backend == "triposr":
        run_triposr(args.image, out, args)
    else:
        run_trellis2(args.image, out, args)

    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest[args.key] = {"file": out.name, "height": args.height, "rotY": args.rot, "rotX": args.rot_x, "source": args.backend}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Saved {out.relative_to(ROOT)}. Reload the game to see the new '{args.key}'.")


if __name__ == "__main__":
    main()

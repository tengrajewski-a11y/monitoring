#!/usr/bin/env python3
"""Generate a creature model from a picture with an open-source image-to-3D
model running on your own GPU, and plug it into Fibula 3D.

Backends (both MIT licensed):
  triposr  - VAST-AI-Research/TripoSR. Fast, ~6 GB VRAM. Vertex coloured mesh.
  trellis2 - microsoft/TRELLIS.2 (4B). Linux + NVIDIA GPU with >= 24 GB VRAM.
             Textured mesh with high-quality geometry.

Setup (once): clone the backend repository and install its dependencies, then
run this script with that environment's Python, pointing --repo at the clone.

TripoSR (Windows, Linux or macOS; without a CUDA GPU it runs on the CPU, slowly):

    git clone https://github.com/VAST-AI-Research/TripoSR ~/TripoSR
    pip install torch            # with an NVIDIA GPU use the CUDA command from pytorch.org
    pip install omegaconf einops transformers trimesh huggingface-hub "rembg[cpu]" PyMCubes fast-simplification
    python tools/local_generate.py wolf concept/wolf.png --backend triposr --repo ~/TripoSR --height 0.8

TripoSR's own requirements.txt builds torchmcubes from source (on Windows that
needs MSVC and the CUDA toolkit). This script uses torchmcubes when it is
installed and PyMCubes otherwise, so that step can be skipped.

TRELLIS.2 (Linux, NVIDIA GPU with >= 24 GB VRAM):

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


def install_mcubes_fallback():
    """TripoSR imports torchmcubes. If it is not installed, provide the same
    function on top of PyMCubes (same vertex order and winding)."""
    try:
        import torchmcubes  # noqa: F401
        return
    except ImportError:
        pass
    import types
    import mcubes
    import numpy as np
    import torch

    def marching_cubes(volume, threshold):
        verts, faces = mcubes.marching_cubes(volume.detach().cpu().numpy(), threshold)
        # torchmcubes returns (x, y, z) = (last, middle, first) array axis
        verts = torch.from_numpy(np.ascontiguousarray(verts[:, ::-1], dtype=np.float32))
        return verts, torch.from_numpy(faces.astype(np.int64))

    sys.modules["torchmcubes"] = types.SimpleNamespace(marching_cubes=marching_cubes)
    print("  torchmcubes not installed, using PyMCubes")


def srgb_to_linear(rgb):
    """TripoSR predicts sRGB colours; glTF vertex colours (COLOR_0) are linear."""
    import numpy as np

    c = np.clip(rgb, 0.0, 1.0)
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return np.round(lin * 255).astype(np.uint8)


def keep_main_parts(mesh, min_share=0.02):
    """Drop the small floating blobs marching cubes leaves around the model."""
    import trimesh

    parts = mesh.split(only_watertight=False)
    if len(parts) <= 1:
        return mesh
    total = sum(len(p.faces) for p in parts)
    return trimesh.util.concatenate([p for p in parts if len(p.faces) >= total * min_share])


def to_gltf_orientation(mesh):
    """TripoSR works Z-up with the input picture seen from +X. glTF (and the
    game) is Y-up with the front facing +Z: (x, y, z) -> (y, z, x). TripoSR's
    own to_gradio_3d_orientation turns the front to -Z for Gradio's viewer."""
    import numpy as np

    mesh.apply_transform(np.array([[0, 1, 0, 0], [0, 0, 1, 0], [1, 0, 0, 0], [0, 0, 0, 1]], dtype=float))
    return mesh


# transformers 5 renamed the ViT layers; TripoSR's checkpoint has the 4.x names
VIT_RENAMES = [
    (".encoder.layer.", ".layers."),
    (".attention.attention.query.", ".attention.q_proj."),
    (".attention.attention.key.", ".attention.k_proj."),
    (".attention.attention.value.", ".attention.v_proj."),
    (".attention.output.dense.", ".attention.o_proj."),
    (".intermediate.dense.", ".mlp.fc1."),
    (".output.dense.", ".mlp.fc2."),
]


def load_triposr(name):
    """TSR.from_pretrained that also works with transformers 5."""
    import torch
    from huggingface_hub import hf_hub_download
    from omegaconf import OmegaConf
    from tsr.system import TSR

    if os.path.isdir(name):
        cfg_path, ckpt_path = os.path.join(name, "config.yaml"), os.path.join(name, "model.ckpt")
    else:
        cfg_path = hf_hub_download(repo_id=name, filename="config.yaml")
        ckpt_path = hf_hub_download(repo_id=name, filename="model.ckpt")
    cfg = OmegaConf.load(cfg_path)
    OmegaConf.resolve(cfg)
    model = TSR(cfg)
    state = torch.load(ckpt_path, map_location="cpu")
    if not set(state) <= set(model.state_dict()):
        renamed = {}
        for k, v in state.items():
            if k.startswith("image_tokenizer.model.encoder.layer."):
                for old, new in VIT_RENAMES:
                    k = k.replace(old, new)
            renamed[k] = v
        state = renamed
    model.load_state_dict(state)
    return model


def run_triposr(image_path, out, args):
    install_mcubes_fallback()
    import numpy as np
    import rembg
    import torch
    import trimesh
    from PIL import Image
    from tsr.utils import remove_background, resize_foreground

    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        print("  no CUDA GPU found, running on the CPU (a few minutes per model)")
    model = load_triposr(args.model or "stabilityai/TripoSR")
    model.renderer.set_chunk_size(8192)
    model.to(device)
    # same preprocessing as TripoSR's run.py; u2net (170 MB, Apache-2.0) because newer
    # rembg defaults to a 1 GB background model with a non-commercial licence
    image = remove_background(Image.open(image_path), rembg.new_session("u2net"))
    image = resize_foreground(image, 0.85)
    image = np.array(image).astype(np.float32) / 255.0
    image = image[:, :, :3] * image[:, :, 3:4] + (1 - image[:, :, 3:4]) * 0.5
    image = Image.fromarray((image * 255.0).astype(np.uint8))
    with torch.no_grad():
        scene_codes = model([image], device=device)
    mesh = keep_main_parts(model.extract_mesh(scene_codes, False, resolution=args.resolution)[0])
    if args.faces and len(mesh.faces) > args.faces:
        try:
            mesh = mesh.simplify_quadric_decimation(face_count=args.faces)
        except Exception as e:  # trimesh needs fast-simplification for this
            print(f"  (skipping decimation: {e})")
    # colour the final (decimated) vertices straight from the model's colour field
    with torch.no_grad():
        verts = torch.tensor(mesh.vertices, dtype=torch.float32, device=device)
        color = model.renderer.query_triplane(model.decoder, verts, scene_codes[0])["color"]
    mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=srgb_to_linear(color.cpu().numpy()))
    mesh = to_gltf_orientation(mesh)
    print(f"  {len(mesh.faces)} faces")
    # smooth vertex normals; without them the game shades every face flat
    mesh.export(out, include_normals=not args.flat)


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
    ap.add_argument("--model", help="TripoSR weights: Hugging Face repo or a local folder with config.yaml and model.ckpt")
    ap.add_argument("--height", type=float, default=1.0, help="height of the model in tiles")
    ap.add_argument("--rot", type=float, default=0.0, help="extra rotation around Y in degrees")
    ap.add_argument("--rot-x", type=float, default=0.0, help="extra rotation around X in degrees (fix lying models)")
    ap.add_argument("--faces", type=int, default=8000, help="target face count (low poly suits the retro look)")
    ap.add_argument("--resolution", type=int, default=192, help="TripoSR marching cubes resolution")
    ap.add_argument("--flat", action="store_true", help="faceted look: no vertex normals, every face shaded flat")
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
    # keep hand-tuned fields of an existing entry (gait, hands...)
    manifest[args.key] = {**manifest.get(args.key, {}), "file": out.name, "height": args.height, "rotY": args.rot,
                          "rotX": args.rot_x, "source": args.backend}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Saved {out.relative_to(ROOT)}. Reload the game to see the new '{args.key}'.")


if __name__ == "__main__":
    main()

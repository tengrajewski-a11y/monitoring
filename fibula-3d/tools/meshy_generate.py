#!/usr/bin/env python3
"""Generate a 3D model with the Meshy AI API and plug it into Fibula 3D.

The model is downloaded as GLB into client/assets/models/custom/<key>.glb and
registered in client/assets/models/custom/manifest.json. The game client then
uses it instead of the built-in model for the creature type <key> (monster
keys from server/data/monsters.js, e.g. dragon, wolf, orc, lich).

Requirements: Python 3.8+ (standard library only) and a Meshy API key.

    export MESHY_API_KEY=msy_...
    # text to 3D (preview mesh; add --refine for a textured model)
    python3 tools/meshy_generate.py dragon "stylized low poly red dragon, game asset" --refine --height 2.0
    # image to 3D
    python3 tools/meshy_generate.py wolf --image concept/wolf.png --height 0.8

Notes
- Endpoints follow Meshy's public OpenAPI (text-to-3d v2, image-to-3d v1).
  If Meshy changes its API, adjust API_BASE / payloads below.
- Check the licence that applies to your Meshy plan before publishing
  generated models (some plans require attribution).
"""

import argparse
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

API_BASE = "https://api.meshy.ai/openapi"
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "client" / "assets" / "models" / "custom"


def api(method, path, key, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API_BASE}{path}", data=data, method=method, headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f"Meshy API error {e.code}: {e.read().decode(errors='replace')}")


def wait(kind, task_id, key):
    path = f"/v2/text-to-3d/{task_id}" if kind == "text" else f"/v1/image-to-3d/{task_id}"
    while True:
        t = api("GET", path, key)
        status = t.get("status")
        print(f"  {status} {t.get('progress', 0)}%", flush=True)
        if status == "SUCCEEDED":
            return t
        if status in ("FAILED", "CANCELED", "EXPIRED"):
            sys.exit(f"Task {task_id} ended with status {status}: {t.get('task_error')}")
        time.sleep(8)


def image_payload(src):
    if src.startswith("http://") or src.startswith("https://"):
        return src
    p = Path(src)
    mime = mimetypes.guess_type(p.name)[0] or "image/png"
    return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"


def main():
    ap = argparse.ArgumentParser(description="Generate a Fibula 3D creature model with Meshy AI")
    ap.add_argument("key", help="creature type to replace, e.g. dragon, wolf, orc")
    ap.add_argument("prompt", nargs="?", help="text prompt (text to 3D)")
    ap.add_argument("--image", help="image file or URL (image to 3D)")
    ap.add_argument("--refine", action="store_true", help="run the texturing (refine) stage for text to 3D")
    ap.add_argument("--polycount", type=int, default=8000, help="target polycount (low poly suits the retro look)")
    ap.add_argument("--height", type=float, default=1.0, help="height of the model in tiles")
    ap.add_argument("--rot", type=float, default=0.0, help="extra rotation around Y in degrees (model should face +Z)")
    args = ap.parse_args()

    key = os.environ.get("MESHY_API_KEY")
    if not key:
        sys.exit("Set MESHY_API_KEY first.")
    if not args.prompt and not args.image:
        sys.exit("Give a text prompt or --image.")
    if not args.key.replace("_", "").isalnum():
        sys.exit("Creature key may only contain letters, digits and underscores.")

    if args.image:
        print("Image to 3D...")
        res = api("POST", "/v1/image-to-3d", key, {
            "image_url": image_payload(args.image), "enable_pbr": False, "should_remesh": True,
            "should_texture": True, "topology": "triangle", "target_polycount": args.polycount,
        })
        task = wait("image", res["result"], key)
    else:
        print("Text to 3D (preview)...")
        res = api("POST", "/v2/text-to-3d", key, {
            "mode": "preview", "prompt": args.prompt, "art_style": "realistic", "should_remesh": True,
            "topology": "triangle", "target_polycount": args.polycount,
        })
        task = wait("text", res["result"], key)
        if args.refine:
            print("Refine (texturing)...")
            res = api("POST", "/v2/text-to-3d", key, {"mode": "refine", "preview_task_id": task["id"], "enable_pbr": False})
            task = wait("text", res["result"], key)

    url = (task.get("model_urls") or {}).get("glb")
    if not url:
        sys.exit("The task finished but no GLB url was returned.")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{args.key}.glb"
    print(f"Downloading {out.relative_to(ROOT)}...")
    with urllib.request.urlopen(url, timeout=300) as r:
        out.write_bytes(r.read())

    manifest_path = OUT_DIR / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    manifest[args.key] = {"file": out.name, "height": args.height, "rotY": args.rot, "source": "Meshy AI"}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Done. '{args.key}' will use the new model after reloading the game.")


if __name__ == "__main__":
    main()

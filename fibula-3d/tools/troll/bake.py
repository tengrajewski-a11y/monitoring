# Orc and troll models from the Troll.obj supplied by the project owner (one
# static mesh, 479 parts, no texture): every part gets a role (classify.py),
# each variant a palette (variants.json); parts are decimated separately so
# their colours never bleed, and the GLB gets linear vertex colours.
#
#   cd <folder with Troll.obj>
#   python tools/troll/bake.py client/assets/models/custom/orc.glb '<palette json>' 9000
import json
import sys

import numpy as np
import trimesh

sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from classify import load_parts  # noqa: E402

out, palette = sys.argv[1], json.loads(sys.argv[2])
faces = int(sys.argv[3]) if len(sys.argv) > 3 else 10000


def srgb_to_linear(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


parts, roles = load_parts("Troll.obj")
total = sum(len(p.faces) for p in parts)
ratio = min(1.0, faces / total)
rng = np.random.default_rng(7)
out_parts = []
for p, r in zip(parts, roles):
    # decimate each part on its own so colours never bleed between parts
    want = max(8, int(len(p.faces) * ratio))
    if len(p.faces) > want:
        try:
            p = p.simplify_quadric_decimation(face_count=want)
        except Exception:
            pass
    base = np.array(list(bytes.fromhex(palette[r].lstrip("#"))), dtype=float) / 255
    jitter = 1 + rng.uniform(-0.05, 0.05)
    y = p.vertices[:, 1]
    span = max(1e-6, y.max() - y.min())
    shade = 0.82 + 0.18 * (y - y.min()) / span        # darker towards the bottom: cheap occlusion
    lin = srgb_to_linear(np.clip(base[None, :] * jitter * shade[:, None], 0, 1))
    p.visual = trimesh.visual.ColorVisuals(p, vertex_colors=np.round(np.c_[lin, np.ones(len(lin))] * 255).astype(np.uint8))
    out_parts.append(p)
mesh = trimesh.util.concatenate(out_parts)
mesh.update_faces(mesh.nondegenerate_faces())          # zero-area triangles give NaN normals
mesh.remove_unreferenced_vertices()
n = mesh.vertex_normals
bad = ~np.isfinite(n).all(1) | (np.linalg.norm(n, axis=1) < 1e-6)
if bad.any():
    n = n.copy()
    n[bad] = [0.0, 1.0, 0.0]
    mesh.vertex_normals = n
print("bad normals fixed:", int(bad.sum()))
mesh.export(out, include_normals=True)
print(out, len(mesh.faces), "faces")

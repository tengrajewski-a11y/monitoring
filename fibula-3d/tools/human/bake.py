# Humanoid monsters from the low-poly human base mesh (OBJ face groups are
# Rigify bone names): re-posed into a neutral stance, coloured by body region,
# limb number stored in the vertex alpha (read by the "rig" walk cycle), and
# the joints + hand positions written for the game's manifest. Flat faces, no
# normals: the game shades them flat, which also follows the animated limbs.
#
#   python bake.py out.glb '<palette json>' [human.obj]  -> prints the manifest fields as JSON
#   (variants.json lists the palettes used for the bundled monsters; unweld.mjs
#   then drops the index buffer)
import json
import os
import sys

import numpy as np
import trimesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rig import joints, read_obj, repose, vertex_parts  # noqa: E402

out, palette = sys.argv[1], json.loads(sys.argv[2])
src = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "human.obj")

HEAD = ("spine.006", "jaw", "chin", "cheek", "nose", "lip", "ear", "brow", "forehead", "temple", "lid", "tongue", "teeth")


def role(group, y, head_top, head_bottom):
    g = group or ""
    if g.startswith("eye"):
        return "eyes"
    if g.startswith(HEAD):
        return "hair" if y > head_bottom + (head_top - head_bottom) * 0.72 else "skin"
    if g.startswith(("spine.005", "spine.004")):
        return "skin"                                        # neck
    if g.startswith(("hand", "palm", "thumb", "f_")):
        return "hands"
    if g.startswith("forearm"):
        return "forearm"
    if g.startswith(("upper_arm", "shoulder")):
        return "sleeve"
    if g.startswith(("shin", "foot", "toe", "heel")):
        return "boots"
    if g.startswith(("thigh", "pelvis")):
        return "pants"
    return "top"


def srgb_to_linear(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


v, faces, groups = read_obj(src)
vp = vertex_parts(v, faces, groups)
v, J = repose(v, vp, joints(v, faces, groups))

# head extent for the hair line
head_idx = np.unique(np.concatenate([f for f, g in zip(faces, groups) if (g or "").startswith(HEAD)]))
head_top, head_bottom = v[head_idx, 1].max(), v[head_idx, 1].min()

# unshared vertices per face so each face keeps its region colour
tri = v[faces.reshape(-1)]
part = vp[faces.reshape(-1)]
cols = np.zeros((len(tri), 4))
for i, g in enumerate(groups):
    y = v[faces[i], 1].mean()
    hexc = palette.get(role(g, y, head_top, head_bottom)) or palette["top"]
    cols[i * 3:i * 3 + 3, :3] = np.array(list(bytes.fromhex(hexc.lstrip("#")))) / 255
# gentle top-down shading per part and the limb id in alpha (decoded as floor(a * 16))
span = v[:, 1].max() - v[:, 1].min()
cols[:, :3] *= (0.86 + 0.14 * (tri[:, 1] - v[:, 1].min()) / span)[:, None]
lin = srgb_to_linear(cols[:, :3])
alpha = (part + 0.5) / 16
mesh = trimesh.Trimesh(vertices=tri, faces=np.arange(len(tri)).reshape(-1, 3), process=False)
mesh.visual = trimesh.visual.ColorVisuals(mesh, vertex_colors=np.round(np.c_[lin, alpha] * 255).astype(np.uint8))
mesh.export(out, include_normals=False)

# joints and hands in the game's normalised space (feet on 0, centred, height 1)
lo, hi = tri.min(0), tri.max(0)
h = hi[1] - lo[1]
cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
norm = lambda p: [round(float((p[0] - cx) / h), 4), round(float((p[1] - lo[1]) / h), 4), round(float((p[2] - cz) / h), 4)]
order = ["hipL", "kneeL", "shoulderL", "elbowL", "hipR", "kneeR", "shoulderR", "elbowR"]
print(json.dumps({"joints": [norm(J[k]) for k in order],
                  "hands": {"r": norm(J["wristR"]), "l": norm(J["wristL"])}}))

# Parts and joints of the low-poly human (OBJ face groups are Rigify bone names),
# plus a rigid re-pose from its running pose into a neutral stance.
import numpy as np

# part ids: 0 body/head, 1 thigh L, 2 shin+foot L, 3 thigh R, 4 shin+foot R,
#           5 upper arm L, 6 forearm+hand L, 7 upper arm R, 8 forearm+hand R
LEG_LOWER = ("shin", "foot", "toe", "heel")
ARM_LOWER = ("forearm", "hand", "palm", "thumb", "f_index", "f_middle", "f_ring", "f_pinky")


def part_of(group):
    g = group or ""
    side = 0 if g.endswith(".L") or ".L." in g else 1 if g.endswith(".R") or ".R." in g else -1
    if side < 0:
        return 0
    base = 1 + side * 2
    if g.startswith("thigh"):
        return base
    if g.startswith(LEG_LOWER):
        return base + 1
    if g.startswith("upper_arm"):
        return base + 4
    if g.startswith(ARM_LOWER):
        return base + 5
    return 0


def read_obj(path):
    v, faces, groups = [], [], []
    cur = None
    for line in open(path):
        if line.startswith("v "):
            v.append([float(t) for t in line.split()[1:4]])
        elif line.startswith("g "):
            cur = line[2:].strip()
        elif line.startswith("f "):
            idx = [int(t.split("/")[0]) - 1 for t in line.split()[1:]]
            for i in range(1, len(idx) - 1):
                faces.append([idx[0], idx[i], idx[i + 1]])
                groups.append(cur)
    return np.array(v), np.array(faces), groups


def vertex_parts(v, faces, groups):
    vp = np.zeros(len(v), dtype=int)
    for f, g in zip(faces, groups):
        p = part_of(g)
        if p:
            vp[f] = np.maximum(vp[f], p)
    return vp


def joint(v, faces, groups, a_pred, b_pred):
    """centre of the vertices shared by faces of group a and group b"""
    A, B = set(), set()
    for f, g in zip(faces, groups):
        g = g or ""
        if a_pred(g):
            A.update(f)
        if b_pred(g):
            B.update(f)
    s = sorted(A & B)
    return v[s].mean(0) if s else None


def joints(v, faces, groups):
    J = {}
    for side, S in (("L", ".L"), ("R", ".R")):
        is_side = lambda g, S=S: g.endswith(S) or (S + ".") in g
        J["hip" + side] = joint(v, faces, groups, lambda g: g.startswith("thigh") and is_side(g), lambda g: not g.startswith(("thigh",) + LEG_LOWER))
        J["knee" + side] = joint(v, faces, groups, lambda g: g.startswith("thigh") and is_side(g), lambda g: g.startswith(LEG_LOWER) and is_side(g))
        J["shoulder" + side] = joint(v, faces, groups, lambda g: g.startswith("upper_arm") and is_side(g), lambda g: not g.startswith(("upper_arm",) + ARM_LOWER))
        J["elbow" + side] = joint(v, faces, groups, lambda g: g.startswith("upper_arm") and is_side(g), lambda g: g.startswith(ARM_LOWER) and is_side(g))
        J["ankle" + side] = joint(v, faces, groups, lambda g: g.startswith("shin") and is_side(g), lambda g: g.startswith(("foot", "toe", "heel")) and is_side(g))
        J["wrist" + side] = joint(v, faces, groups, lambda g: g.startswith("forearm") and is_side(g), lambda g: g.startswith(ARM_LOWER[1:]) and is_side(g))
    return J


def rot_x(p, pivot, ang):
    c, s = np.cos(ang), np.sin(ang)
    d = p - pivot
    return np.c_[d[:, 0], d[:, 1] * c - d[:, 2] * s, d[:, 1] * s + d[:, 2] * c] + pivot


def pitch(a, b):
    """angle of segment a->b around X, 0 = straight down"""
    d = b - a
    return np.arctan2(d[2], -d[1])


def repose(v, vp, J):
    """legs straight down, upper arms down, forearms bent forward a little"""
    v = v.copy()
    J = {k: x.copy() for k, x in J.items()}
    for side, (thigh, shin, ua, fa) in (("L", (1, 2, 5, 6)), ("R", (3, 4, 7, 8))):
        hip, knee, ankle = J["hip" + side], J["knee" + side], J["ankle" + side]
        a = pitch(hip, knee)                     # rotating by +pitch points the segment straight down
        sel = (vp == thigh) | (vp == shin)
        v[sel] = rot_x(v[sel], hip, a)
        knee, ankle = rot_x(np.array([knee, ankle]), hip, a)
        b = pitch(knee, ankle)
        v[vp == shin] = rot_x(v[vp == shin], knee, b)
        ankle = rot_x(ankle[None], knee, b)[0]
        J["knee" + side], J["ankle" + side] = knee, ankle
        sh, el, wr = J["shoulder" + side], J["elbow" + side], J["wrist" + side]
        a = pitch(sh, el)
        sel = (vp == ua) | (vp == fa)
        v[sel] = rot_x(v[sel], sh, a)
        el, wr = rot_x(np.array([el, wr]), sh, a)
        b = pitch(el, wr) - 0.35                 # forearm 20 degrees forward, ready to hold a weapon
        v[vp == fa] = rot_x(v[vp == fa], el, b)
        wr = rot_x(wr[None], el, b)[0]
        J["elbow" + side], J["wrist" + side] = el, wr
    return v, J

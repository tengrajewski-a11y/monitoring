# Part roles for the uploaded Troll.obj (one mesh, 479 separate parts, no texture).
import numpy as np
import trimesh

ROLES = ["skin", "armor", "leather", "cloth", "bone", "metal", "rope"]


def role_of(faces, c, e):
    x, y, z = c
    ax = abs(x)
    big = faces >= 1300
    if big and y > 1.6 and ax < 0.05:
        return "metal"                                 # helmet
    if big and y > 1.4 and ax < 0.1 and e[0] < 0.7:
        return "skin"                                  # head
    if e[0] > 1.2 and y > 1.0:
        return "skin"                                  # torso and arms
    if big and 0.5 < ax < 0.7 and 1.1 < y < 1.4:
        return "armor"                                 # shoulder pads
    if big and 0.55 < ax < 0.7 and y < 0.35 and y > 0.1:
        return "skin"                                  # hands
    if big and y < 0.0:
        return "skin"                                  # feet
    if faces > 1500 and ax < 0.05 and 0.3 < y < 0.5:
        return "cloth"                                 # skirt
    if 0.15 < ax < 0.4 and 0.15 < y < 0.35 and e[1] < 0.25:
        return "armor"                                 # knee guards
    if ax < 0.05 and 0.9 < y < 1.05 and z > 0.45:
        return "bone"                                  # skull pendant
    if ax < 0.05 and 0.8 < y < 0.95 and e[0] > 0.6:
        return "leather"                               # belt
    if 0.5 < ax < 0.75 and 0.45 < y < 0.85:
        return "leather" if faces > 1000 else "metal"  # bracers and their bands
    if 0.45 < ax < 0.65 and 1.0 < y < 1.4:
        return "leather"                               # straps under the pads
    if 0.15 < ax < 0.3 and y > 1.75:
        return "bone"                                  # horns
    if ax < 0.1 and 1.2 < y < 1.4 and e[0] < 0.75:
        return "rope"                                  # necklace
    if y < 0.75 and ax < 0.5 and z > 0.0 and faces > 300:
        return "cloth"                                 # loincloth
    if faces < 120 and ax < 0.45 and 0.9 < y < 1.45 and z > 0.2:
        return "bone"                                  # tooth pendants on the necklace
    if faces < 120:
        return "bone" if (y > 1.35 or y < 0.35) else "metal"  # teeth, claws, spikes / rivets
    return "leather"


def load_parts(path):
    m = trimesh.load(path, force="mesh", process=True)
    parts = m.split(only_watertight=False)
    roles = [role_of(len(p.faces), p.bounds.mean(0), p.extents) for p in parts]
    return parts, roles

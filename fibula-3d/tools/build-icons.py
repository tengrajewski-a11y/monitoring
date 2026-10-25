#!/usr/bin/env python3
"""Item icon atlas from two public-domain (CC0) pixel-art packs on OpenGameArt:

  * "496 pixel art icons for medieval/fantasy RPG" by Henrique Lazarini (7Soul1)
    https://opengameart.org/node/39455  (34x34 icons)
  * "Idylwild's Inventory" by Idylwild
    https://opengameart.org/node/171013  (32x32 icons)

Writes client/assets/icons/items.png (34x34 cells) and items.json (item key ->
cell). Items not listed here keep their procedural icon from client/js/icons.js.
Some icons are recoloured (hue shift) to match the item.

    pip install pillow
    python tools/build-icons.py                      # downloads both packs
    python tools/build-icons.py --soul DIR --idyl DIR   # or use unpacked folders
"""

import argparse
import colorsys
import io
import json
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "client" / "assets" / "icons"
CELL, COLS = 34, 12
PACKS = {
    "soul": "https://opengameart.org/sites/default/files/496_RPG_icons.zip",
    "idyl": "https://opengameart.org/sites/default/files/idylwilds_inventory.zip",
}

# item key -> (pack, file name without .png, hue shift in degrees[, saturation, brightness])
ICONS = {
    "knife": ("soul", "W_Dagger004", 0),
    "short_sword": ("soul", "W_Sword010", 0),
    "iron_sword": ("soul", "W_Sword012", 0),
    "long_sword": ("soul", "W_Sword011", 0),
    "runed_sword": ("soul", "W_Sword005", 0),
    "hand_axe": ("soul", "W_Axe001", 0),
    "battle_axe": ("soul", "W_Axe014", 0),
    "orc_cleaver": ("soul", "W_Axe011", 0),
    "club": ("soul", "W_Mace001", 0),
    "mace": ("soul", "W_Mace009", 0),
    "morning_star": ("soul", "W_Mace004", 0),
    "bone_club": ("soul", "W_Mace012", 0),
    "spear": ("soul", "W_Spear001", 0),
    "wand_sparks": ("soul", "W_Mace008", 0),
    "wand_embers": ("soul", "W_Mace007", 0),
    "rod_moss": ("soul", "W_Staff02", 0),
    "rod_frost": ("soul", "W_Staff06", 0),
    "wooden_shield": ("soul", "E_Wood02", 0),
    "steel_shield": ("soul", "E_Metal04", 0),
    "knight_shield": ("soul", "E_Gold01", 0),
    "spellbook": ("soul", "W_Book06", 0),
    "leather_armor": ("soul", "A_Armour01", 0),
    "plate_armor": ("soul", "A_Armor04", 0),
    "dragon_mail": ("soul", "A_Armor05", 100, 0.72, 0.78),
    "leather_helmet": ("soul", "C_Elm01", 0),
    "iron_helmet": ("soul", "C_Elm03", 0),
    "steel_helmet": ("soul", "C_Elm04", 0),
    "wizard_hat": ("soul", "C_Hat01", -35),
    "leather_boots": ("soul", "A_Shoes01", 0),
    "swift_boots": ("soul", "A_Shoes02", 45),
    "bone_amulet": ("soul", "Ac_Necklace06", 0),
    "ember_amulet": ("soul", "Ac_Necklace01", 0),
    "apple": ("idyl", "apple", 0),
    "bread": ("soul", "I_C_Bread", 0),
    "cheese": ("soul", "I_C_Cheese", 0),
    "meat": ("soul", "I_C_Meat", 0),
    "ham": ("soul", "I_C_RawMeat", 0),
    "fish": ("soul", "I_C_RawFish", 0),
    "health_potion": ("soul", "P_Red01", 0),
    "great_health_potion": ("soul", "P_Pink05", 0),
    "mana_potion": ("soul", "P_Blue05", 0),
    "antidote": ("soul", "I_Antidote", 0),
    "wolf_pelt": ("soul", "I_WolfFur", 0),
    "spider_silk": ("idyl", "silk", 0),
    "orc_tooth": ("soul", "I_Fang", 0),
    "bone": ("soul", "I_Bone", 0),
    "dragon_scale": ("soul", "I_SolidShell", 110, 0.7, 0.8),
    "ruby": ("soul", "I_Ruby", 0),
    "sapphire": ("soul", "I_Sapphire", 0),
    "torch": ("soul", "I_Torch02", 0),
}


def pack_dir(name, given, cache):
    if given:
        return Path(given)
    d = cache / name
    if not d.exists():
        print(f"downloading {PACKS[name]}")
        data = urllib.request.urlopen(PACKS[name], timeout=120).read()
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for m in z.namelist():
                # only flat image files, nothing outside the folder
                if m.lower().endswith(".png") and "/" not in m.strip("/") and ".." not in m:
                    d.mkdir(parents=True, exist_ok=True)
                    (d / Path(m).name).write_bytes(z.read(m))
    return d


def hue_shift(im, deg, sat=1.0, val=1.0):
    if not deg and sat == 1 and val == 1:
        return im
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if not a:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < 0.12:          # keep greys, whites and the outline
                continue
            r2, g2, b2 = colorsys.hsv_to_rgb((h + deg / 360) % 1, min(1, s * sat), min(1, v * val))
            px[x, y] = (round(r2 * 255), round(g2 * 255), round(b2 * 255), a)
    return im


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--soul", help="folder with the unpacked 496 RPG icons")
    ap.add_argument("--idyl", help="folder with the unpacked Idylwild's Inventory icons")
    ap.add_argument("--cache", default=str(Path.home() / ".cache" / "fibula-icons"))
    args = ap.parse_args()
    dirs = {"soul": pack_dir("soul", args.soul, Path(args.cache)), "idyl": pack_dir("idyl", args.idyl, Path(args.cache))}

    keys = list(ICONS)
    rows = (len(keys) + COLS - 1) // COLS
    atlas = Image.new("RGBA", (COLS * CELL, rows * CELL), (0, 0, 0, 0))
    for i, key in enumerate(keys):
        pack, name, *tint = ICONS[key]
        im = hue_shift(Image.open(dirs[pack] / f"{name}.png").convert("RGBA"), *tint)
        # 32x32 icons sit in the middle of the 34x34 cell
        atlas.paste(im, ((i % COLS) * CELL + (CELL - im.width) // 2, (i // COLS) * CELL + (CELL - im.height) // 2), im)
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / "items.png", optimize=True)
    (OUT / "items.json").write_text(json.dumps({"cell": CELL, "cols": COLS, "icons": {k: i for i, k in enumerate(keys)}}, indent=1) + "\n")
    print(f"{len(keys)} icons -> {OUT / 'items.png'}")


if __name__ == "__main__":
    main()

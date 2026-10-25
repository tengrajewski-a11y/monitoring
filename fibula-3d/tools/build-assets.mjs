// Builds the game's 3D asset bundles from the CC0 KayKit packs by Kay Lousberg
// (https://kaylousberg.com). Run once after cloning the packs:
//
//   KAYKIT_DIR=/path/to/kaykit-game-assets node tools/build-assets.mjs
//
// KAYKIT_DIR must contain the cloned repositories, e.g.
//   kaykit-character-pack-adventures-1.0, kaykit-character-pack-skeletons-1.0,
//   kaykit-dungeon-remastered-1.0, kaykit-halloween-bits-1.0,
//   kaykit-medieval-hexagon-pack-1.0, kaykit-furniture-bits-1.0,
//   kaykit-restaurant-bits-1.0
//
// Output (client/assets/models):
//   chars/<Name>.glb  – rigged characters without animations
//   anims.glb         – shared animation clips (Rig_Medium)
//   props.glb         – environment props, each wrapped in a node named by key
//   gear.glb          – weapons and shields (same layout)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, mergeDocuments, unpartition, resample } from '@gltf-transform/functions';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.env.KAYKIT_DIR || path.join(ROOT, '..', '..', 'kaykit-game-assets'));
const OUT = path.join(ROOT, 'client', 'assets', 'models');
const io = new NodeIO();

function dropAnimation(a) {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

const CHARACTERS = ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded',
  'Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue'];

const CLIPS = ['Idle', 'Walking_A', 'Running_A', 'Unarmed_Idle', '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal',
  '1H_Melee_Attack_Stab', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', '2H_Melee_Idle', '1H_Ranged_Shoot', '2H_Ranged_Shoot',
  'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Long', 'Hit_A', 'Hit_B', 'Death_A', 'Death_A_Pose', 'Death_B', 'Death_B_Pose',
  'Block_Hit', 'Cheer', 'Unarmed_Melee_Attack_Punch_A', 'Throw', 'Use_Item', 'PickUp', 'Interact', 'Sit_Floor_Idle',
  'Idle_Combat', 'Skeletons_Awaken_Standing', 'Spawn_Ground_Skeletons'];

// key -> source file name (searched recursively inside SRC, glTF folders only)
const PROPS = {
  tree_a: 'tree_single_A.gltf', tree_b: 'tree_single_B.gltf', trees_small: 'trees_A_small.gltf',
  tree_dead_l: 'tree_dead_large.gltf', tree_dead_m: 'tree_dead_medium.gltf', tree_dead_s: 'tree_dead_small.gltf',
  tree_pine_orange: 'tree_pine_orange_medium.gltf', tree_pine_yellow: 'tree_pine_yellow_medium.gltf',
  rock_a: 'rock_single_A.gltf', rock_b: 'rock_single_B.gltf', rock_c: 'rock_single_C.gltf', rock_d: 'rock_single_D.gltf', rock_e: 'rock_single_E.gltf',
  mountain_a: 'mountain_A.gltf', mountain_b: 'mountain_B.gltf', mountain_c: 'mountain_C.gltf',
  mountain_a_grass: 'mountain_A_grass.gltf', mountain_b_trees: 'mountain_B_grass_trees.gltf', hill_a: 'hill_single_A.gltf',
  cloud_big: 'cloud_big.gltf', cloud_small: 'cloud_small.gltf',
  waterlily: 'waterlily_A.gltf', waterplant: 'waterplant_A.gltf', waterplant_b: 'waterplant_B.gltf',
  tent: 'tent.gltf', weaponrack: 'weaponrack.gltf', sack: 'sack.gltf', bucket: 'bucket_water.gltf', wheelbarrow: 'wheelbarrow.gltf',
  lumber: 'resource_lumber.gltf', stones: 'resource_stone.gltf', target: 'target.gltf', flag: 'flag_red.gltf', ladder: 'ladder.gltf',
  crate_hex: 'crate_A_big.gltf', fence_wood: 'fence_wood_straight.gltf',
  grave_a: 'grave_A.gltf', grave_b: 'grave_B.gltf', gravestone: 'gravestone.gltf', gravemarker: 'gravemarker_A.gltf',
  fence: 'fence.gltf', fence_pillar: 'fence_pillar.gltf', fence_gate: 'fence_gate.gltf', lantern_post: 'post_lantern.gltf',
  lantern_standing: 'lantern_standing.gltf', bones_a: 'bone_A.gltf', bones_b: 'bone_B.gltf', ribcage: 'ribcage.gltf', skull: 'skull.gltf',
  coffin: 'coffin.gltf', coffin_deco: 'coffin_decorated.gltf', shrine: 'shrine_candles.gltf', bench: 'bench.gltf',
  pumpkin: 'pumpkin_orange.gltf', candle_triple: 'candle_triple.gltf', crypt: 'crypt.gltf',
  barrel: 'barrel_large.gltf.glb', barrel_small: 'barrel_small.gltf.glb', keg: 'keg.gltf.glb', box: 'box_large.gltf.glb',
  box_stack: 'box_stacked.gltf.glb', crates: 'crates_stacked.gltf.glb', chest: 'chest.glb', chest_gold: 'chest_gold.glb',
  table: 'table_medium.gltf.glb', table_long: 'table_long_decorated_A.gltf.glb', chair: 'chair.gltf.glb', stool: 'stool.gltf.glb',
  shelves: 'shelves.gltf.glb', shelf: 'shelf_large.gltf.glb', pillar: 'pillar.gltf.glb', column: 'column.gltf.glb',
  torch_wall: 'torch_mounted.gltf.glb', torch: 'torch_lit.gltf.glb', bed: 'bed_decorated.gltf.glb', stairs: 'stairs.gltf.glb',
  banner_red: 'banner_patternA_red.gltf.glb', banner_blue: 'banner_shield_blue.gltf.glb', rubble: 'rubble_large.gltf.glb',
  sword_shield: 'sword_shield.gltf.glb', coins_s: 'coin_stack_small.gltf.glb', coins_m: 'coin_stack_medium.gltf.glb',
  coins_l: 'coin_stack_large.gltf.glb', bottle_red: 'bottle_A_brown.gltf.glb', bottle_green: 'bottle_A_green.gltf.glb',
  bottle_b: 'bottle_B_green.gltf.glb', key: 'key.gltf.glb', candle: 'candle_lit.gltf.glb', plate_food: 'plate_food_A.gltf.glb',
  wall: 'wall.gltf.glb', wall_corner: 'wall_corner.gltf.glb', wall_pillar: 'wall_pillar.gltf.glb', wall_window: 'wall_window_open.gltf.glb',
  wall_doorway: 'wall_doorway.glb', wall_broken: 'wall_broken.gltf.glb',
  bed_single: 'bed_single_A.gltf', bookshelf: 'shelf_B_large_decorated.gltf', book_set: 'book_set.gltf', rug: 'rug_rectangle_stripes_A.gltf',
  lamp_standing: 'lamp_standing.gltf', table_small: 'table_small.gltf', chair_wood: 'chair_A_wood.gltf', cabinet: 'cabinet_medium_decorated.gltf',
  food_ham: 'food_ingredient_ham_cooked.gltf', food_cheese: 'food_ingredient_cheese.gltf', food_steak: 'food_ingredient_steak.gltf',
  food_tomato: 'food_ingredient_tomato.gltf', food_bun: 'food_ingredient_bun.gltf', food_carrot: 'food_ingredient_carrot.gltf',
  crate_cheese: 'crate_cheese.gltf', crate_carrots: 'crate_carrots.gltf', crate_tomatoes: 'crate_tomatoes.gltf', pot_stew: 'pot_A_stew.gltf',
  jar: 'jar_A_medium.gltf', mug: 'mug_full.gltf',
};

const GEAR = {
  sword_1h: 'sword_1handed.gltf', sword_2h: 'sword_2handed.gltf', sword_2h_color: 'sword_2handed_color.gltf', dagger: 'dagger.gltf',
  axe_1h: 'axe_1handed.gltf', axe_2h: 'axe_2handed.gltf', crossbow_1h: 'crossbow_1handed.gltf', crossbow_2h: 'crossbow_2handed.gltf',
  staff: 'staff.gltf', wand: 'wand.gltf', spellbook: 'spellbook_closed.gltf', shield_round: 'shield_round.gltf',
  shield_round_color: 'shield_round_color.gltf', shield_square: 'shield_square.gltf', shield_badge: 'shield_badge_color.gltf',
  shield_spikes: 'shield_spikes.gltf', quiver: 'quiver.gltf', arrow: 'arrow.gltf', arrow_bundle: 'arrow_bundle.gltf',
  skel_axe: 'Skeleton_Axe.gltf', skel_blade: 'Skeleton_Blade.gltf', skel_staff: 'Skeleton_Staff.gltf', skel_crossbow: 'Skeleton_Crossbow.gltf',
  skel_shield: 'Skeleton_Shield_Large_A.gltf', skel_shield_small: 'Skeleton_Shield_Small_A.gltf', skel_arrow: 'Skeleton_Arrow.gltf',
};

function indexFiles(dir) {
  const map = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'fbx' || e.name === 'obj' || e.name.startsWith('fbx(')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(gltf|glb)$/.test(e.name) && !map.has(e.name)) map.set(e.name, p);
    }
  };
  walk(dir);
  return map;
}

async function bundle(entries, files, outFile) {
  let target = null;
  let mainScene = null;
  for (const [key, name] of Object.entries(entries)) {
    const file = files.get(name);
    if (!file) { console.warn(`  ! missing ${name} (${key})`); continue; }
    const doc = await io.read(file);
    for (const a of doc.getRoot().listAnimations()) dropAnimation(a);
    const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
    const wrapper = doc.createNode(key);
    for (const child of scene.listChildren()) { scene.removeChild(child); wrapper.addChild(child); }
    scene.addChild(wrapper);
    if (!target) { target = doc; mainScene = scene; continue; }
    const map = mergeDocuments(target, doc);
    const merged = map.get(scene);
    for (const child of merged.listChildren()) { merged.removeChild(child); mainScene.addChild(child); }
    merged.dispose();
  }
  target.getRoot().setDefaultScene(mainScene);
  await target.transform(dedup(), unpartition(), prune());
  await io.write(outFile, target);
  console.log(`  ${path.relative(ROOT, outFile)} ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`KayKit folder not found: ${SRC}\nSet KAYKIT_DIR to the folder with the cloned KayKit repositories.`);
    process.exit(1);
  }
  const files = indexFiles(SRC);
  fs.mkdirSync(path.join(OUT, 'chars'), { recursive: true });

  console.log('Characters');
  for (const name of CHARACTERS) {
    const file = files.get(`${name}.glb`);
    if (!file) { console.warn(`  ! missing ${name}.glb`); continue; }
    const doc = await io.read(file);
    for (const a of doc.getRoot().listAnimations()) dropAnimation(a);
    await doc.transform(prune());
    const out = path.join(OUT, 'chars', `${name}.glb`);
    await io.write(out, doc);
    console.log(`  ${path.relative(ROOT, out)} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
  }

  console.log('Animations');
  {
    const doc = await io.read(files.get('Skeleton_Warrior.glb'));
    const keep = new Set(CLIPS);
    for (const a of doc.getRoot().listAnimations()) if (!keep.has(a.getName())) dropAnimation(a);
    // drop geometry, keep the bone hierarchy the clips are bound to
    for (const n of doc.getRoot().listNodes()) { n.setMesh(null); n.setSkin(null); }
    await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepLeaves: true }));
    const out = path.join(OUT, 'anims.glb');
    await io.write(out, doc);
    console.log(`  ${path.relative(ROOT, out)} ${(fs.statSync(out).size / 1024).toFixed(0)} KB, ${doc.getRoot().listAnimations().length} clips`);
  }

  console.log('Props');
  await bundle(PROPS, files, path.join(OUT, 'props.glb'));
  console.log('Gear');
  await bundle(GEAR, files, path.join(OUT, 'gear.glb'));
}

main().catch((e) => { console.error(e); process.exit(1); });

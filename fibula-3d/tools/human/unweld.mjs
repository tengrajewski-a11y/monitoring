// Drops the index buffer of the baked humanoids (every face has its own three
// vertices anyway), which saves a fifth of the file.
//   node tools/human/unweld.mjs client/assets/models/custom/zombie.glb ...
import { NodeIO } from '@gltf-transform/core';
import { unweld } from '@gltf-transform/functions';

const io = new NodeIO();
for (const file of process.argv.slice(2)) {
  const doc = await io.read(file);
  await doc.transform(unweld());
  await io.write(file, doc);
}

// electron-builder "afterPack" hook. Kopiujemy zbudowany serwer Next.js
// (.next/standalone, z pełnym node_modules i natywnym bindingiem
// better-sqlite3 ze wszystkimi platformami) bezpośrednio do resources/app
// spakowanej aplikacji — ręcznie, żeby ominąć domyślną logikę
// electron-buildera dot. asar/asar.unpacked, która przy tym projekcie
// gubiła node_modules przy standardowym `extraResources`.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const projectRoot = path.join(__dirname, "..");
  const standaloneDir = path.join(projectRoot, ".next", "standalone");
  const destDir = path.join(context.appOutDir, "resources", "app");

  if (!fs.existsSync(standaloneDir)) {
    throw new Error(
      `Brak ${standaloneDir} — uruchom "next build" (przez npm run build:electron) przed electron-builder.`,
    );
  }

  fs.rmSync(destDir, { recursive: true, force: true });
  fs.cpSync(standaloneDir, destDir, { recursive: true });

  console.log(`[after-pack] Skopiowano ${standaloneDir} -> ${destDir}`);
};

// Po `next build` (z output: "standalone") trzeba ręcznie dołożyć
// `public/` i `.next/static/` do folderu standalone — Next.js świadomie
// ich tam nie kopiuje (w typowym wdrożeniu serwuje je CDN/reverse proxy).
// W wersji desktopowej serwer Next musi je mieć obok siebie.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const standaloneDir = path.join(root, ".next", "standalone");

if (!fs.existsSync(standaloneDir)) {
  console.error(
    "Brak .next/standalone — upewnij się, że next.config.ts ma `output: \"standalone\"` i uruchom najpierw `next build`.",
  );
  process.exit(1);
}

fs.cpSync(path.join(root, "public"), path.join(standaloneDir, "public"), {
  recursive: true,
});
fs.cpSync(
  path.join(root, ".next", "static"),
  path.join(standaloneDir, ".next", "static"),
  { recursive: true },
);

// Next.js zostawia w .next/standalone/.next/node_modules symlinki będące
// wewnętrznym artefaktem cache'u tracingu (nie są potrzebne do działania
// serwera — realne zależności są w .next/standalone/node_modules).
// Psują pakowanie przez electron-builder/7zip, więc je usuwamy.
const staleTraceModules = path.join(standaloneDir, ".next", "node_modules");
if (fs.existsSync(staleTraceModules)) {
  fs.rmSync(staleTraceModules, { recursive: true, force: true });
}

console.log("Skopiowano public/ i .next/static/ do .next/standalone/.");

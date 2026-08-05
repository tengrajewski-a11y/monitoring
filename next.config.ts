import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Wymagane przez wersję desktopową (Electron): produkuje samowystarczalny
  // folder .next/standalone (z wyśledzonymi node_modules, w tym natywnym
  // bindingiem better-sqlite3), który można spakować i uruchomić bez
  // instalowania node_modules na maszynie użytkownika.
  output: "standalone",
};

export default nextConfig;

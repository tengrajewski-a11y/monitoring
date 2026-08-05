import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

export const metadata: Metadata = {
  title: "Trinity Trust — Monitoring Legislacyjny",
  description:
    "Monitoring legislacyjny i medialny dla klientów Trinity Trust Corporate Counsel.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NavBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
        <footer className="border-t border-border py-6">
          <div className="mx-auto max-w-6xl px-4 text-xs text-muted sm:px-6">
            Trinity Trust Corporate Counsel — monitoring legislacyjny i medialny.
            Źródła: Sejm RP (api.sejm.gov.pl), Rządowe Centrum Legislacji, EUR-Lex.
          </div>
        </footer>
      </body>
    </html>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

const TABS = [
  { href: "/panel-admina/uzytkownicy", label: "Użytkownicy" },
  { href: "/panel-admina/klienci", label: "Klienci" },
  { href: "/panel-admina/dziedziny", label: "Dziedziny" },
];

export default async function PanelAdminaLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
          Panel administracyjny
        </p>
        <h1 className="mt-2 font-brand text-2xl text-foreground sm:text-3xl">
          Zarządzanie aplikacją
        </h1>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-black/5 hover:text-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}

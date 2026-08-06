"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";
import { logout } from "@/app/login/actions";
import type { SessionPayload } from "@/lib/session";

const LINKS = [
  { href: "/", label: "Pulpit" },
  { href: "/monitoring", label: "Monitoring" },
  { href: "/komisje", label: "Komisje" },
  { href: "/alerty", label: "Alerty" },
  { href: "/dziedziny", label: "Dziedziny" },
  { href: "/media", label: "Media" },
];

export function NavBar({ user }: { user: SessionPayload | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = user?.role === "ADMIN" ? [...LINKS, { href: "/panel-admina", label: "Panel admina" }] : LINKS;

  if (!user) {
    return (
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center px-4 py-3 sm:px-6">
          <Logo />
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "text-muted hover:bg-black/5 hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <span className="text-xs text-muted">{user.name || user.email}</span>
          <form action={logout}>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              Wyloguj
            </button>
          </form>
        </div>

        <button
          type="button"
          aria-label="Otwórz menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-md border border-border md:hidden"
        >
          <span className="sr-only">Menu</span>
          <div className="flex flex-col gap-1">
            <span className="h-px w-4 bg-foreground" />
            <span className="h-px w-4 bg-foreground" />
            <span className="h-px w-4 bg-foreground" />
          </div>
        </button>
      </div>

      {open && (
        <nav className="border-t border-border bg-surface md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {links.map((link) => {
              const active =
                link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-3 py-2.5 text-sm font-medium ${
                    active ? "bg-foreground text-background" : "text-muted"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
              <span className="text-xs text-muted">{user.name || user.email}</span>
              <form action={logout}>
                <button
                  type="submit"
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted"
                >
                  Wyloguj
                </button>
              </form>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}

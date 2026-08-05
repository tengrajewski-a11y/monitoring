"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

type DomainOption = { slug: string; name: string; color: string };

const SOURCES = [
  { value: "", label: "Wszystkie źródła" },
  { value: "SEJM", label: "Sejm RP" },
  { value: "RCL", label: "RCL" },
  { value: "EUR_LEX", label: "EUR-Lex" },
];

const STATUSES = [
  { value: "", label: "Wszystkie statusy" },
  { value: "NOWY", label: "Nowy" },
  { value: "W_TOKU", label: "W toku" },
  { value: "PRZYJETY", label: "Przyjęty" },
  { value: "OPUBLIKOWANY", label: "Opublikowany" },
  { value: "ODRZUCONY", label: "Odrzucony" },
  { value: "WYCOFANY", label: "Wycofany" },
];

export function FilterBar({ domains }: { domains: DomainOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.push(`/monitoring?${params.toString()}`);
    });
  }

  const activeDomain = searchParams.get("dziedzina") ?? "";

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateParam("q", q);
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Szukaj po tytule lub opisie…"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Szukaj
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => updateParam("dziedzina", "")}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            activeDomain === ""
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted hover:border-foreground/40"
          }`}
        >
          Wszystkie dziedziny
        </button>
        {domains.map((d) => (
          <button
            key={d.slug}
            onClick={() => updateParam("dziedzina", d.slug)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            style={
              activeDomain === d.slug
                ? { background: d.color, borderColor: d.color, color: "#fff" }
                : { borderColor: "var(--border)", color: "var(--muted)" }
            }
          >
            {d.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          defaultValue={searchParams.get("zrodlo") ?? ""}
          onChange={(e) => updateParam("zrodlo", e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        >
          {SOURCES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          defaultValue={searchParams.get("status") ?? ""}
          onChange={(e) => updateParam("status", e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await fetch("/api/ingest", { method: "POST" });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-foreground/40 disabled:opacity-50"
    >
      {loading ? "Odświeżanie…" : "Odśwież dane"}
    </button>
  );
}

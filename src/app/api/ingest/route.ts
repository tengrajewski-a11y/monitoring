import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingest";

export const dynamic = "force-dynamic";

/**
 * Ręczne / cykliczne odświeżenie danych ze wszystkich źródeł.
 * Jeśli ustawiono zmienną środowiskową INGEST_SECRET, żądanie musi zawierać
 * nagłówek `x-ingest-secret` z tą samą wartością (np. do wywołania z crona).
 */
export async function POST(request: Request) {
  const secret = process.env.INGEST_SECRET;
  if (secret && request.headers.get("x-ingest-secret") !== secret) {
    return NextResponse.json({ error: "Brak autoryzacji" }, { status: 401 });
  }

  const { results, komisje } = await ingestAll();
  return NextResponse.json({
    ok: true,
    results: results.map((r) => ({
      source: r.source,
      items: r.items.length,
      isFallback: r.isFallback,
      itemsNew: r.itemsNew,
      itemsUpdated: r.itemsUpdated,
      errorMessage: r.errorMessage,
    })),
    komisje,
  });
}

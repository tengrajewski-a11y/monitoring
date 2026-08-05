import { prisma } from "./db";
import type { ItemStatus, SourceType } from "../generated/prisma/client";

export async function getDomains() {
  return prisma.domain.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });
}

export async function getDomainBySlug(slug: string) {
  return prisma.domain.findUnique({ where: { slug } });
}

export type ItemFilters = {
  domainSlug?: string;
  source?: SourceType;
  status?: ItemStatus;
  q?: string;
};

/**
 * Wyszukiwanie po frazach: fraza jest dzielona na pojedyncze słowa, a każde
 * z nich musi wystąpić (bez rozróżniania wielkości liter) w tytule, opisie,
 * instytucji lub aktualnym etapie — dzięki temu np. "energia sejm" znajdzie
 * dokumenty zawierające oba słowa niezależnie od kolejności.
 */
function buildSearchWhere(q: string) {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length === 0) return {};

  return {
    AND: words.map((word) => ({
      OR: [
        { title: { contains: word, mode: "insensitive" as const } },
        { summary: { contains: word, mode: "insensitive" as const } },
        { institution: { contains: word, mode: "insensitive" as const } },
        { stage: { contains: word, mode: "insensitive" as const } },
      ],
    })),
  };
}

export async function getItems(filters: ItemFilters = {}, take = 50) {
  return prisma.monitoringItem.findMany({
    where: {
      source: filters.source,
      status: filters.status,
      ...(filters.domainSlug
        ? { domains: { some: { domain: { slug: filters.domainSlug } } } }
        : {}),
      ...(filters.q ? buildSearchWhere(filters.q) : {}),
    },
    include: {
      domains: { include: { domain: true } },
    },
    orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
    take,
  });
}

export async function getItemById(id: string) {
  return prisma.monitoringItem.findUnique({
    where: { id },
    include: {
      domains: { include: { domain: true } },
      events: { orderBy: { date: "desc" } },
    },
  });
}

export async function getDashboardStats() {
  const [domains, totalItems, bySourceRaw, recentItems, lastLogs] = await Promise.all([
    prisma.domain.findMany({
      where: { active: true },
      orderBy: { order: "asc" },
      include: { _count: { select: { items: true } } },
    }),
    prisma.monitoringItem.count(),
    prisma.monitoringItem.groupBy({ by: ["source"], _count: { _all: true } }),
    prisma.monitoringItem.findMany({
      orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
      take: 8,
      include: { domains: { include: { domain: true } } },
    }),
    prisma.ingestionLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 3,
      distinct: ["source"],
    }),
  ]);

  const bySource = Object.fromEntries(
    bySourceRaw.map((r) => [r.source, r._count._all]),
  ) as Record<SourceType, number>;

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const newThisWeek = await prisma.monitoringItem.count({
    where: { createdAt: { gte: weekAgo } },
  });

  return { domains, totalItems, bySource, recentItems, lastLogs, newThisWeek };
}

export async function getIngestionLogs() {
  return prisma.ingestionLog.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });
}

export async function getCommittees() {
  return prisma.committee.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { sittings: true } },
      sittings: { orderBy: { date: "desc" }, take: 1 },
    },
  });
}

export async function getCommitteeByCode(code: string) {
  return prisma.committee.findUnique({
    where: { code },
    include: {
      sittings: { orderBy: [{ date: "desc" }, { number: "desc" }] },
    },
  });
}

/** Ostatnie zdarzenia (nowe pozycje / zmiany statusu i etapu) — zasila stronę "Alerty". */
export async function getRecentEvents(filters: { domainSlug?: string } = {}, take = 50) {
  return prisma.itemEvent.findMany({
    where: filters.domainSlug
      ? { item: { domains: { some: { domain: { slug: filters.domainSlug } } } } }
      : {},
    include: {
      item: { include: { domains: { include: { domain: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

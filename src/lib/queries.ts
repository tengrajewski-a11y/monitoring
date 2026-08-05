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

export async function getItems(filters: ItemFilters = {}, take = 50) {
  return prisma.monitoringItem.findMany({
    where: {
      source: filters.source,
      status: filters.status,
      ...(filters.domainSlug
        ? { domains: { some: { domain: { slug: filters.domainSlug } } } }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { title: { contains: filters.q } },
              { summary: { contains: filters.q } },
            ],
          }
        : {}),
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

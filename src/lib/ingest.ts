import { prisma } from "./db";
import { fetchSejmItems } from "./connectors/sejm";
import { fetchRclItems } from "./connectors/rcl";
import { fetchEurLexItems } from "./connectors/eurlex";
import type { ConnectorResult, NormalizedItem } from "./types";
import type { SourceType } from "../generated/prisma/client";

const CONNECTORS: Record<SourceType, () => Promise<ConnectorResult>> = {
  SEJM: fetchSejmItems,
  RCL: fetchRclItems,
  EUR_LEX: fetchEurLexItems,
  MEDIA: async () => ({ items: [], isFallback: true, errorMessage: "Monitoring mediów: etap kolejny" }),
};

async function upsertItem(source: SourceType, item: NormalizedItem, isFallback: boolean) {
  const domainRecords = await prisma.domain.findMany({
    where: { slug: { in: item.domainSlugs } },
    select: { id: true },
  });

  const saved = await prisma.monitoringItem.upsert({
    where: { source_externalId: { source, externalId: item.externalId } },
    create: {
      source,
      externalId: item.externalId,
      kind: item.kind,
      status: item.status,
      title: item.title,
      summary: item.summary,
      stage: item.stage,
      institution: item.institution,
      url: item.url,
      documentDate: item.documentDate,
      publishedAt: item.publishedAt,
      isFallback,
      raw: item.raw ? JSON.stringify(item.raw) : undefined,
      domains: {
        create: domainRecords.map((d) => ({ domainId: d.id })),
      },
    },
    update: {
      kind: item.kind,
      status: item.status,
      title: item.title,
      summary: item.summary,
      stage: item.stage,
      institution: item.institution,
      url: item.url,
      documentDate: item.documentDate,
      publishedAt: item.publishedAt,
      isFallback,
      raw: item.raw ? JSON.stringify(item.raw) : undefined,
    },
    select: { id: true, createdAt: true, updatedAt: true },
  });

  // Odśwież tagi dziedzin (na wypadek zmiany klasyfikacji przy kolejnym imporcie)
  await prisma.itemDomain.deleteMany({ where: { itemId: saved.id } });
  if (domainRecords.length > 0) {
    await prisma.itemDomain.createMany({
      data: domainRecords.map((d) => ({ itemId: saved.id, domainId: d.id })),
    });
  }

  return saved.createdAt.getTime() === saved.updatedAt.getTime();
}

export async function ingestSource(source: SourceType) {
  const startedAt = new Date();
  const result = await CONNECTORS[source]();

  let itemsNew = 0;
  let itemsUpdated = 0;

  for (const item of result.items) {
    const isNew = await upsertItem(source, item, result.isFallback);
    if (isNew) itemsNew++;
    else itemsUpdated++;
  }

  await prisma.ingestionLog.create({
    data: {
      source,
      startedAt,
      finishedAt: new Date(),
      status: result.errorMessage ? "fallback" : "success",
      itemsFound: result.items.length,
      itemsNew,
      itemsUpdated,
      errorMessage: result.errorMessage,
    },
  });

  return { source, ...result, itemsNew, itemsUpdated };
}

export async function ingestAll() {
  const sources: SourceType[] = ["SEJM", "RCL", "EUR_LEX"];
  const results = [];
  for (const source of sources) {
    results.push(await ingestSource(source));
  }
  return results;
}

import { prisma } from "./db";
import { fetchSejmItems } from "./connectors/sejm";
import { fetchRclItems } from "./connectors/rcl";
import { fetchEurLexItems } from "./connectors/eurlex";
import { fetchKomisje } from "./connectors/komisje";
import { STATUS_LABEL } from "./labels";
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

  const existing = await prisma.monitoringItem.findUnique({
    where: { source_externalId: { source, externalId: item.externalId } },
    select: { id: true, status: true, stage: true },
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

  // Alerty zmian: logujemy zdarzenie, gdy pozycja jest nowa albo zmienił się
  // jej etap/status względem poprzedniego importu — zasila to stronę /alerty.
  if (!existing) {
    await prisma.itemEvent.create({
      data: {
        itemId: saved.id,
        label: `Nowa pozycja w monitoringu${item.stage ? `: ${item.stage}` : ""}`,
        date: new Date(),
      },
    });
  } else if (item.stage && item.stage !== existing.stage) {
    await prisma.itemEvent.create({
      data: { itemId: saved.id, label: item.stage, date: new Date() },
    });
  } else if (item.status !== existing.status) {
    await prisma.itemEvent.create({
      data: {
        itemId: saved.id,
        label: `Zmiana statusu: ${STATUS_LABEL[item.status]}`,
        date: new Date(),
      },
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
  const komisje = await ingestKomisje();
  return { results, komisje };
}

export async function ingestKomisje() {
  const result = await fetchKomisje();

  for (const c of result.committees) {
    await prisma.committee.upsert({
      where: { code: c.code },
      create: {
        code: c.code,
        name: c.name,
        nameGenitive: c.nameGenitive,
        type: c.type,
        scope: c.scope,
        phone: c.phone,
        isFallback: result.isFallback,
      },
      update: {
        name: c.name,
        nameGenitive: c.nameGenitive,
        type: c.type,
        scope: c.scope,
        phone: c.phone,
        isFallback: result.isFallback,
      },
    });
  }

  for (const s of result.sittings) {
    const committee = await prisma.committee.findUnique({
      where: { code: s.committeeCode },
      select: { id: true },
    });
    if (!committee) continue;

    await prisma.committeeSitting.upsert({
      where: { committeeId_number: { committeeId: committee.id, number: s.number } },
      create: {
        committeeId: committee.id,
        number: s.number,
        date: s.date,
        agenda: s.agenda,
        remoteUrl: s.remoteUrl,
        isFallback: result.isFallback,
      },
      update: {
        date: s.date,
        agenda: s.agenda,
        remoteUrl: s.remoteUrl,
        isFallback: result.isFallback,
      },
    });
  }

  return {
    committees: result.committees.length,
    sittings: result.sittings.length,
    isFallback: result.isFallback,
    errorMessage: result.errorMessage,
  };
}

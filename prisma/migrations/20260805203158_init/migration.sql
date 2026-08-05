-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#111111',
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DomainKeyword" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    CONSTRAINT "DomainKeyword_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClientDomain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    CONSTRAINT "ClientDomain_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientDomain_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'AGENCY',
    "clientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonitoringItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INNE',
    "status" TEXT NOT NULL DEFAULT 'NIEZNANY',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "stage" TEXT,
    "institution" TEXT,
    "url" TEXT NOT NULL,
    "documentDate" DATETIME,
    "publishedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" TEXT,
    "isFallback" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ItemDomain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    CONSTRAINT "ItemDomain_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MonitoringItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ItemDomain_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemEvent_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "MonitoringItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IngestionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL,
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsNew" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_slug_key" ON "Domain"("slug");

-- CreateIndex
CREATE INDEX "DomainKeyword_term_idx" ON "DomainKeyword"("term");

-- CreateIndex
CREATE UNIQUE INDEX "DomainKeyword_domainId_term_key" ON "DomainKeyword"("domainId", "term");

-- CreateIndex
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClientDomain_clientId_domainId_key" ON "ClientDomain"("clientId", "domainId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "MonitoringItem_source_idx" ON "MonitoringItem"("source");

-- CreateIndex
CREATE INDEX "MonitoringItem_documentDate_idx" ON "MonitoringItem"("documentDate");

-- CreateIndex
CREATE INDEX "MonitoringItem_status_idx" ON "MonitoringItem"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringItem_source_externalId_key" ON "MonitoringItem"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDomain_itemId_domainId_key" ON "ItemDomain"("itemId", "domainId");

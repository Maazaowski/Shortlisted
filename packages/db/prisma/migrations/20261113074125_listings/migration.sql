-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "feedHash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "location" TEXT,
    "mode" TEXT NOT NULL,
    "remote" JSONB NOT NULL,
    "admits" TEXT[],
    "countries" TEXT[],
    "sponsorship" JSONB NOT NULL,
    "licensedSponsor" TEXT[],
    "field" TEXT NOT NULL,
    "skills" TEXT[],
    "description" TEXT NOT NULL,
    "employmentType" TEXT,
    "families" TEXT[],
    "postedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "savedAt" TIMESTAMP(3),
    "hiddenAt" TIMESTAMP(3),
    "applicationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedSync" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "builtAt" TIMESTAMP(3),
    "lastError" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "attribution" JSONB NOT NULL DEFAULT '[]',
    "visitAt" TIMESTAMP(3),
    "prevVisitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_userId_closedAt_postedAt_idx" ON "Listing"("userId", "closedAt", "postedAt");

-- CreateIndex
CREATE INDEX "Listing_userId_applicationId_idx" ON "Listing"("userId", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_userId_feedId_key" ON "Listing"("userId", "feedId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedSync_userId_key" ON "FeedSync"("userId");

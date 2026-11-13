-- CreateTable
CREATE TABLE "Preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "homeCountry" TEXT NOT NULL DEFAULT 'PK',
    "citizenship" TEXT NOT NULL DEFAULT 'PK',
    "pools" TEXT[] DEFAULT ARRAY['remote', 'relocate', 'gulf']::TEXT[],
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "targetTitles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "weeklyGoal" INTEGER,
    "feedUrl" TEXT,
    "savedAt" TIMESTAMP(3),
    "extensionSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Preferences_userId_key" ON "Preferences"("userId");

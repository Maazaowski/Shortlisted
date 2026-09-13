-- CreateEnum
CREATE TYPE "BankEntryKind" AS ENUM ('ROLE', 'PROJECT');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('SAVED', 'GENERATED', 'APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('STRONG', 'GOOD', 'POSSIBLE', 'POOR');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('RESUME', 'COVER_LETTER');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "skillGroups" JSONB NOT NULL DEFAULT '[]',
    "education" JSONB NOT NULL DEFAULT '[]',
    "fileNameFormat" TEXT NOT NULL DEFAULT '{name} - {title} - {company}.pdf',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "BankEntryKind" NOT NULL,
    "organization" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "url" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankBullet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metric" TEXT,
    "inBase" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankBullet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT,
    "sourceHost" TEXT,
    "title" TEXT,
    "company" TEXT,
    "rawText" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "parsed" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL DEFAULT 'SAVED',
    "fitVerdict" "Verdict",
    "fitScore" INTEGER,
    "gaps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rejectionReason" TEXT,
    "generationStatus" "GenerationStatus" NOT NULL DEFAULT 'QUEUED',
    "generationError" TEXT,
    "regenerateNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStage" "Stage",
    "toStage" "Stage" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "version" INTEGER NOT NULL,
    "selection" JSONB NOT NULL,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "diff" JSONB,
    "fileName" TEXT NOT NULL,
    "fileKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "rule" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE INDEX "BankEntry_userId_sortOrder_idx" ON "BankEntry"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "BankBullet_userId_idx" ON "BankBullet"("userId");

-- CreateIndex
CREATE INDEX "BankBullet_entryId_sortOrder_idx" ON "BankBullet"("entryId", "sortOrder");

-- CreateIndex
CREATE INDEX "Job_userId_url_idx" ON "Job"("userId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "Job_userId_contentHash_key" ON "Job"("userId", "contentHash");

-- CreateIndex
CREATE INDEX "Application_userId_stage_idx" ON "Application"("userId", "stage");

-- CreateIndex
CREATE INDEX "Application_userId_updatedAt_idx" ON "Application"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "StageEvent_applicationId_createdAt_idx" ON "StageEvent"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_applicationId_type_version_key" ON "Document"("applicationId", "type", "version");

-- CreateIndex
CREATE INDEX "Note_applicationId_createdAt_idx" ON "Note"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "Reminder_userId_dueAt_idx" ON "Reminder"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_applicationId_rule_key" ON "Reminder"("applicationId", "rule");

-- AddForeignKey
ALTER TABLE "BankBullet" ADD CONSTRAINT "BankBullet_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "BankEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEvent" ADD CONSTRAINT "StageEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

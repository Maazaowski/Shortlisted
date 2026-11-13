-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactUrl" TEXT,
ADD COLUMN     "deadlineAt" TIMESTAMP(3),
ADD COLUMN     "interviewAt" TIMESTAMP(3);

-- AlterEnum
ALTER TYPE "GenerationStatus" ADD VALUE 'WAITING';

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "pendingSelection" JSONB;

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "covered" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "niceToHaveCovered" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "parsed" JSONB;

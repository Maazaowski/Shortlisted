-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "certifications" JSONB NOT NULL DEFAULT '[]';

-- Education entries gained gpa and honors. The bank schema requires both keys,
-- so give existing entries null for each; keys already present win.
UPDATE "Profile"
SET "education" = (
  SELECT COALESCE(jsonb_agg('{"gpa": null, "honors": null}'::jsonb || e), '[]'::jsonb)
  FROM jsonb_array_elements("education") AS e
)
WHERE jsonb_typeof("education") = 'array' AND jsonb_array_length("education") > 0;

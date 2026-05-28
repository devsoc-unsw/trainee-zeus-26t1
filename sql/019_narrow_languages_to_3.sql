-- 019_narrow_languages_to_3.sql
--
-- Lock the picker down to Python, Java, and C. All other languages
-- removed from the DB CHECK constraint to match the new UI.
-- Safe to run now: the submissions table is empty (just wiped).

ALTER TABLE submissions DROP CONSTRAINT submissions_language_check;

ALTER TABLE submissions ADD CONSTRAINT submissions_language_check
  CHECK (language IS NULL OR language IN ('python', 'java', 'c'));

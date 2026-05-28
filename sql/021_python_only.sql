-- 021_python_only.sql
--
-- Narrow languages to python-only. Submissions table is empty (just
-- wiped), so no migration of existing data needed.

ALTER TABLE submissions DROP CONSTRAINT submissions_language_check;

ALTER TABLE submissions ADD CONSTRAINT submissions_language_check
  CHECK (language IS NULL OR language = 'python');

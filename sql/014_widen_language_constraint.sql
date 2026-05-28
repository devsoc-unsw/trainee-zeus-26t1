-- 014_widen_language_constraint.sql
--
-- The original CHECK constraint on submissions.language only allowed
-- python / javascript / java, but the UI picker offers 12 languages.
-- The frontend silently clamped the other 9 to python before submitting,
-- so a player who picked Ruby would write Ruby code but the DB stored
-- language='python' — the next phase then showed their code as Python.
--
-- Widen the constraint to match the picker. The frontend can now stop
-- clamping (the clampLang() helper in editor/[code]/page.jsx and
-- reimplement/[code]/page.jsx becomes dead).

ALTER TABLE submissions DROP CONSTRAINT submissions_language_check;

ALTER TABLE submissions ADD CONSTRAINT submissions_language_check
  CHECK (language IS NULL OR language IN (
    'python', 'javascript', 'typescript', 'java',
    'c', 'cpp', 'csharp', 'rust', 'go', 'ruby', 'swift', 'kotlin'
  ));

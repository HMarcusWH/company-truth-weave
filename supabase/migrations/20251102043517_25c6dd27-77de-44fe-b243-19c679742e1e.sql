-- Add as_of date column to facts table for time provenance
ALTER TABLE facts
ADD COLUMN as_of DATE;

COMMENT ON COLUMN facts.as_of IS 'Document publication/observation date - when the fact was true, not when it was ingested';

-- Index for time-based queries (latest fact per subject+predicate)
CREATE INDEX idx_facts_as_of ON facts(subject, predicate, as_of DESC NULLS LAST);

-- Index for latest verified/pending facts queries
CREATE INDEX idx_facts_latest_active ON facts(subject, predicate, status, as_of DESC NULLS LAST)
WHERE status IN ('pending', 'verified');
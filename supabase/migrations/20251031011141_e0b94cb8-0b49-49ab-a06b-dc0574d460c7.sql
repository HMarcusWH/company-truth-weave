-- Create advisory lock functions for coordinator concurrency control
-- These functions use PostgreSQL's advisory locks to prevent multiple runs from processing the same document

-- Function to try acquiring an advisory lock (non-blocking)
-- Returns true if lock acquired, false if already held by another session
CREATE OR REPLACE FUNCTION try_advisory_lock(key bigint)
RETURNS boolean AS $$
BEGIN
  RETURN pg_try_advisory_lock(key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to release an advisory lock
-- Returns true if lock was held and released, false if not held by this session
CREATE OR REPLACE FUNCTION advisory_unlock(key bigint)
RETURNS boolean AS $$
BEGIN
  RETURN pg_advisory_unlock(key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
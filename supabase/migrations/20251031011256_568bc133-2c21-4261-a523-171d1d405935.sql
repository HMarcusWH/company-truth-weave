-- Harden advisory lock helper functions by setting search_path
CREATE OR REPLACE FUNCTION try_advisory_lock(key bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_try_advisory_lock(key);
END;
$$;

CREATE OR REPLACE FUNCTION advisory_unlock(key bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_advisory_unlock(key);
END;
$$;
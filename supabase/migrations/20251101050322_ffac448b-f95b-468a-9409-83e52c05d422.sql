-- Create extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move extensions from public to extensions schema
ALTER EXTENSION "ltree" SET SCHEMA extensions;
ALTER EXTENSION "citext" SET SCHEMA extensions;
ALTER EXTENSION "pg_trgm" SET SCHEMA extensions;
ALTER EXTENSION "vector" SET SCHEMA extensions;

-- Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
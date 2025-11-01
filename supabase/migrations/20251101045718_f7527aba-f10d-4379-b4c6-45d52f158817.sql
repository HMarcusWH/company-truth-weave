-- Fix Function Search Path Mutable warnings
-- Add search_path to functions that are missing it

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Fix fk_code_value_ok function
CREATE OR REPLACE FUNCTION public.fk_code_value_ok(p_set TEXT, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM code_values cv 
    JOIN code_sets cs ON cs.code_set_id = cv.code_set_id
    WHERE cs.name = p_set AND cv.code = p_code AND cv.is_active
  );
$$;
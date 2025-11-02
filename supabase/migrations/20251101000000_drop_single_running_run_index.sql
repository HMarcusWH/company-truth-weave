-- Remove global single-running-run guard in favor of per-document advisory locks
DROP INDEX IF EXISTS public.ux_single_running_run;

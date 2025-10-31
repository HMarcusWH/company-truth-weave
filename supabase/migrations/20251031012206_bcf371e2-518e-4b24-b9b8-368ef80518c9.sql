-- Enforce single concurrent running coordinator via partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS ux_single_running_run
ON public.runs ((1))
WHERE status_code = 'running';
-- Add missing run status codes for workflow states
INSERT INTO code_values (code_set_id, code, label, sort_order)
SELECT 
  cs.code_set_id,
  'running',
  'Running',
  10
FROM code_sets cs
WHERE cs.name = 'run_status'
AND NOT EXISTS (
  SELECT 1 FROM code_values cv 
  WHERE cv.code_set_id = cs.code_set_id 
  AND cv.code = 'running'
);

INSERT INTO code_values (code_set_id, code, label, sort_order)
SELECT 
  cs.code_set_id,
  'partial',
  'Partial Success',
  20
FROM code_sets cs
WHERE cs.name = 'run_status'
AND NOT EXISTS (
  SELECT 1 FROM code_values cv 
  WHERE cv.code_set_id = cs.code_set_id 
  AND cv.code = 'partial'
);
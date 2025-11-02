-- Phase 1: Add missing Gemini model codes to model_family code set

INSERT INTO code_values (code_set_id, code, label, sort_order, is_active)
SELECT 
  cs.code_set_id,
  'gemini-2.5-pro',
  'Gemini 2.5 Pro',
  10,
  true
FROM code_sets cs
WHERE cs.name = 'model_family'
ON CONFLICT DO NOTHING;

INSERT INTO code_values (code_set_id, code, label, sort_order, is_active)
SELECT 
  cs.code_set_id,
  'gemini-2.5-flash-lite',
  'Gemini 2.5 Flash Lite',
  11,
  true
FROM code_sets cs
WHERE cs.name = 'model_family'
ON CONFLICT DO NOTHING;
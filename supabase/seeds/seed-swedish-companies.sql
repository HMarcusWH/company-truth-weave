-- Seed script for Swedish companies and international entities
-- Run this manually in Lovable Cloud backend SQL editor

-- Swedish Companies
INSERT INTO public.entities (legal_name, entity_type, country_code, website, identifiers) VALUES
('Volvo AB', 'company', 'SE', 'https://www.volvogroup.com', '{"org_nr": "556012-5790", "LEI": "549300OKCY48SDF6BP96"}'),
('Ericsson AB', 'company', 'SE', 'https://www.ericsson.com', '{"org_nr": "556016-0680", "LEI": "549300F2Z7ZK8MVZQT50"}'),
('H&M Hennes & Mauritz AB', 'company', 'SE', 'https://www.hm.com', '{"org_nr": "556042-7220", "LEI": "5299007R8F1IM0NRO787"}'),
('Spotify Technology SA', 'company', 'SE', 'https://www.spotify.com', '{"org_nr": "556703-7485", "LEI": "549300D6Z6K3JYN6FM43"}'),
('Atlas Copco AB', 'company', 'SE', 'https://www.atlascopcogroup.com', '{"org_nr": "556014-2720", "LEI": "549300KTZZCMTM0V1V43"}')
ON CONFLICT DO NOTHING;

-- US Companies
INSERT INTO public.entities (legal_name, entity_type, country_code, website, identifiers) VALUES
('Apple Inc.', 'company', 'US', 'https://www.apple.com', '{"CIK": "0000320193", "EIN": "94-2404110", "LEI": "HWUPKR0MPOU8FGXBT394"}'),
('Microsoft Corporation', 'company', 'US', 'https://www.microsoft.com', '{"CIK": "0000789019", "EIN": "91-1144442", "LEI": "INR2EJN1ERAN0W5ZP974"}'),
('Tesla, Inc.', 'company', 'US', 'https://www.tesla.com', '{"CIK": "0001318605", "EIN": "91-2197729", "LEI": "54930043XZGB27CTOV49"}')
ON CONFLICT DO NOTHING;

-- Sample Swedish documents
INSERT INTO public.documents (entity_id, title, doc_type, published_date, full_text, content_preview, metadata) 
SELECT 
  e.id,
  'Volvo Group Årsredovisning 2024',
  'annual_report',
  '2025-02-15',
  'Detta är Volvo Groups årsredovisning för räkenskapsåret 2024. Koncernen redovisar en nettoomsättning på 473 miljarder kronor...',
  'Volvo Groups årsredovisning för 2024 visar stark tillväxt inom elektrifiering och autonoma transporter.',
  '{"fiscal_year": 2024, "filing_authority": "Bolagsverket", "accounting_standard": "IFRS", "language": "sv", "pages": 156}'::jsonb
FROM public.entities e
WHERE e.legal_name = 'Volvo AB'
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO public.documents (entity_id, title, doc_type, published_date, full_text, content_preview, metadata)
SELECT 
  e.id,
  'Ericsson Delårsrapport Q1 2025',
  'interim_report',
  '2025-04-18',
  'Ericsson presenterar sin delårsrapport för första kvartalet 2025. Nettoomsättningen uppgick till 57 miljarder kronor...',
  'Ericssons Q1-rapport visar fortsatt tillväxt inom 5G-nätverk och mjukvarubaserade lösningar.',
  '{"fiscal_quarter": "Q1", "fiscal_year": 2025, "filing_authority": "Bolagsverket", "accounting_standard": "IFRS", "language": "sv"}'::jsonb
FROM public.entities e
WHERE e.legal_name = 'Ericsson AB'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Sample US SEC documents
INSERT INTO public.documents (entity_id, title, doc_type, published_date, source_url, full_text, content_preview, metadata)
SELECT 
  e.id,
  'Apple Inc. Form 10-K Annual Report 2024',
  'sec_10k',
  '2024-11-01',
  'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193',
  'UNITED STATES SECURITIES AND EXCHANGE COMMISSION. Form 10-K. Annual Report Pursuant to Section 13 or 15(d) of the Securities Exchange Act of 1934...',
  'Apple Inc.''s Form 10-K for fiscal year 2024 reports record revenue of $394.3 billion.',
  '{"form_type": "10-K", "fiscal_year": 2024, "cik": "0000320193", "accession_number": "0000320193-24-000123", "filing_authority": "SEC"}'::jsonb
FROM public.entities e
WHERE e.legal_name = 'Apple Inc.'
LIMIT 1
ON CONFLICT DO NOTHING;

-- Display summary
SELECT 
  e.legal_name,
  e.country_code,
  COUNT(d.id) as document_count
FROM public.entities e
LEFT JOIN public.documents d ON d.entity_id = e.id
WHERE e.country_code IS NOT NULL
GROUP BY e.legal_name, e.country_code
ORDER BY e.country_code, e.legal_name;

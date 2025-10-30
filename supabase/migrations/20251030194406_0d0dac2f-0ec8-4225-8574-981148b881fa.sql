-- Add country_code to entities table
ALTER TABLE public.entities
ADD COLUMN country_code TEXT;

-- Add index for country lookups
CREATE INDEX idx_entities_country_code ON public.entities(country_code);

-- Expand doc_type enum with Swedish and international document types
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'annual_report';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'interim_report';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'prospectus';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'sustainability_report';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'remuneration_report';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'sec_10k';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'sec_10q';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'sec_8k';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'sec_20f';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'esg_report';
ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'offering_circular';

-- Add comment to country_code column
COMMENT ON COLUMN public.entities.country_code IS 'ISO 3166-1 alpha-2 country code (e.g., SE for Sweden, US for United States)';

-- Add index on documents metadata for country-specific queries
CREATE INDEX idx_documents_metadata_gin ON public.documents USING gin(metadata);

-- Add index on entities identifiers for country-specific queries
CREATE INDEX idx_entities_identifiers_gin ON public.entities USING gin(identifiers);
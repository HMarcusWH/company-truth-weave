-- Phase B: Core Schema Alignment Migration
-- Step 1: Install ltree extension for hierarchical taxonomy paths
CREATE EXTENSION IF NOT EXISTS ltree;

-- Step 2: ISO Lookup Tables
CREATE TABLE IF NOT EXISTS public.iso_countries (
  alpha2 CHAR(2) PRIMARY KEY,
  alpha3 CHAR(3) NOT NULL UNIQUE,
  numeric_code CHAR(3),
  name_en TEXT NOT NULL,
  official_name_en TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.iso_currencies (
  code CHAR(3) PRIMARY KEY,
  numeric_code CHAR(3),
  name_en TEXT NOT NULL,
  minor_unit SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 3: Identifier Namespaces
CREATE TABLE IF NOT EXISTS public.identifier_namespaces (
  namespace TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  issuer TEXT,
  scope TEXT,
  pattern TEXT,
  url_template TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 4: Picklist Tables
CREATE TABLE IF NOT EXISTS public.picklist_legal_form (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  country_code CHAR(2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.picklist_company_status (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 5: Taxonomy Infrastructure
CREATE TABLE IF NOT EXISTS public.code_systems (
  code_system_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('industry', 'product_service', 'other')),
  publisher TEXT,
  url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, version)
);

CREATE TABLE IF NOT EXISTS public.taxonomy_nodes (
  node_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_system_id UUID NOT NULL REFERENCES public.code_systems(code_system_id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  parent_code TEXT,
  path LTREE,
  level INTEGER,
  synonyms JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code_system_id, code)
);

CREATE TABLE IF NOT EXISTS public.taxonomy_node_embeddings (
  node_id UUID PRIMARY KEY REFERENCES public.taxonomy_nodes(node_id) ON DELETE CASCADE,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create enum for crosswalk relations
CREATE TYPE xwalk_relation AS ENUM ('exact', 'broader', 'narrower', 'related');

CREATE TABLE IF NOT EXISTS public.taxonomy_crosswalks (
  crosswalk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_system_id UUID NOT NULL REFERENCES public.code_systems(code_system_id),
  from_code TEXT NOT NULL,
  to_system_id UUID NOT NULL REFERENCES public.code_systems(code_system_id),
  to_code TEXT NOT NULL,
  relation xwalk_relation NOT NULL,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  evidence_doc_id UUID REFERENCES public.documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_system_id, from_code, to_system_id, to_code)
);

-- Step 6: Document Chunking
CREATE TABLE IF NOT EXISTS public.document_chunks (
  chunk_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  word_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, seq)
);

CREATE TABLE IF NOT EXISTS public.document_chunk_embeddings (
  chunk_id UUID PRIMARY KEY REFERENCES public.document_chunks(chunk_id) ON DELETE CASCADE,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns to documents table
ALTER TABLE public.documents 
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS source_type TEXT;

-- Step 7: Typed Facts Columns
ALTER TABLE public.facts
  ADD COLUMN IF NOT EXISTS value_number NUMERIC,
  ADD COLUMN IF NOT EXISTS value_date DATE,
  ADD COLUMN IF NOT EXISTS value_money_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS value_money_ccy CHAR(3) REFERENCES public.iso_currencies(code),
  ADD COLUMN IF NOT EXISTS value_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS value_code TEXT,
  ADD COLUMN IF NOT EXISTS value_country CHAR(2) REFERENCES public.iso_countries(alpha2),
  ADD COLUMN IF NOT EXISTS value_entity_id UUID REFERENCES public.entities(id);

-- Step 8: Company Details Schema
CREATE TABLE IF NOT EXISTS public.company_details (
  entity_id UUID PRIMARY KEY REFERENCES public.entities(id) ON DELETE CASCADE,
  legal_form TEXT,
  status TEXT,
  founded_year INTEGER,
  country_code CHAR(2) REFERENCES public.iso_countries(alpha2),
  employees INTEGER,
  size_band TEXT,
  primary_isic_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.entity_identifiers (
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL REFERENCES public.identifier_namespaces(namespace),
  value TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_id, namespace, value)
);

CREATE TABLE IF NOT EXISTS public.entity_addresses (
  address_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  is_hq BOOLEAN DEFAULT FALSE,
  address_line1 TEXT,
  address_line2 TEXT,
  locality TEXT,
  region TEXT,
  postal_code TEXT,
  country_code CHAR(2) REFERENCES public.iso_countries(alpha2),
  lat NUMERIC(9,6),
  lon NUMERIC(9,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.company_industries (
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  code_system_id UUID NOT NULL REFERENCES public.code_systems(code_system_id),
  code TEXT NOT NULL,
  role TEXT CHECK (role IN ('primary', 'secondary')),
  share_pct NUMERIC(5,2),
  as_of DATE,
  evidence_doc_id UUID REFERENCES public.documents(id),
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_id, code_system_id, code)
);

-- Step 9: Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_path ON public.taxonomy_nodes USING GIST(path);
CREATE INDEX IF NOT EXISTS idx_taxonomy_nodes_code_system ON public.taxonomy_nodes(code_system_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_embeddings ON public.taxonomy_node_embeddings USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc ON public.document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings ON public.document_chunk_embeddings USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_facts_typed_values ON public.facts(value_number, value_date, value_code);
CREATE INDEX IF NOT EXISTS idx_entity_identifiers_ns ON public.entity_identifiers(namespace, value);
CREATE INDEX IF NOT EXISTS idx_entity_addresses_entity ON public.entity_addresses(entity_id);
CREATE INDEX IF NOT EXISTS idx_company_industries_entity ON public.company_industries(entity_id);
CREATE INDEX IF NOT EXISTS idx_company_industries_code ON public.company_industries(code_system_id, code);

-- Step 10: RLS Policies
ALTER TABLE public.iso_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iso_currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identifier_namespaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picklist_legal_form ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.picklist_company_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_node_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_crosswalks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunk_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_industries ENABLE ROW LEVEL SECURITY;

-- Everyone can read reference data
CREATE POLICY "Anyone can view ISO countries" ON public.iso_countries FOR SELECT USING (true);
CREATE POLICY "Anyone can view ISO currencies" ON public.iso_currencies FOR SELECT USING (true);
CREATE POLICY "Anyone can view identifier namespaces" ON public.identifier_namespaces FOR SELECT USING (true);
CREATE POLICY "Anyone can view legal forms" ON public.picklist_legal_form FOR SELECT USING (true);
CREATE POLICY "Anyone can view company statuses" ON public.picklist_company_status FOR SELECT USING (true);
CREATE POLICY "Anyone can view code systems" ON public.code_systems FOR SELECT USING (true);
CREATE POLICY "Anyone can view taxonomy nodes" ON public.taxonomy_nodes FOR SELECT USING (true);
CREATE POLICY "Anyone can view taxonomy embeddings" ON public.taxonomy_node_embeddings FOR SELECT USING (true);
CREATE POLICY "Anyone can view crosswalks" ON public.taxonomy_crosswalks FOR SELECT USING (true);
CREATE POLICY "Anyone can view document chunks" ON public.document_chunks FOR SELECT USING (true);
CREATE POLICY "Anyone can view chunk embeddings" ON public.document_chunk_embeddings FOR SELECT USING (true);
CREATE POLICY "Anyone can view company details" ON public.company_details FOR SELECT USING (true);
CREATE POLICY "Anyone can view entity identifiers" ON public.entity_identifiers FOR SELECT USING (true);
CREATE POLICY "Anyone can view entity addresses" ON public.entity_addresses FOR SELECT USING (true);
CREATE POLICY "Anyone can view company industries" ON public.company_industries FOR SELECT USING (true);

-- Authenticated users can write
CREATE POLICY "Authenticated can insert document chunks" ON public.document_chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can insert chunk embeddings" ON public.document_chunk_embeddings FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can insert company details" ON public.company_details FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update company details" ON public.company_details FOR UPDATE USING (true);
CREATE POLICY "Authenticated can insert entity identifiers" ON public.entity_identifiers FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can insert entity addresses" ON public.entity_addresses FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated can update entity addresses" ON public.entity_addresses FOR UPDATE USING (true);
CREATE POLICY "Authenticated can insert company industries" ON public.company_industries FOR INSERT WITH CHECK (true);

-- Admins can manage reference data
CREATE POLICY "Admins manage ISO countries" ON public.iso_countries FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage ISO currencies" ON public.iso_currencies FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage identifier namespaces" ON public.identifier_namespaces FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage legal forms" ON public.picklist_legal_form FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage company statuses" ON public.picklist_company_status FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage code systems" ON public.code_systems FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage taxonomy nodes" ON public.taxonomy_nodes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage taxonomy embeddings" ON public.taxonomy_node_embeddings FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage crosswalks" ON public.taxonomy_crosswalks FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Step 11: Seed Data for ISO Countries (top 20 most common)
INSERT INTO public.iso_countries (alpha2, alpha3, numeric_code, name_en, official_name_en) VALUES
  ('SE', 'SWE', '752', 'Sweden', 'Kingdom of Sweden'),
  ('US', 'USA', '840', 'United States', 'United States of America'),
  ('GB', 'GBR', '826', 'United Kingdom', 'United Kingdom of Great Britain and Northern Ireland'),
  ('DE', 'DEU', '276', 'Germany', 'Federal Republic of Germany'),
  ('FR', 'FRA', '250', 'France', 'French Republic'),
  ('CN', 'CHN', '156', 'China', 'People''s Republic of China'),
  ('JP', 'JPN', '392', 'Japan', 'Japan'),
  ('IN', 'IND', '356', 'India', 'Republic of India'),
  ('CA', 'CAN', '124', 'Canada', 'Canada'),
  ('AU', 'AUS', '036', 'Australia', 'Commonwealth of Australia'),
  ('BR', 'BRA', '076', 'Brazil', 'Federative Republic of Brazil'),
  ('NL', 'NLD', '528', 'Netherlands', 'Kingdom of the Netherlands'),
  ('CH', 'CHE', '756', 'Switzerland', 'Swiss Confederation'),
  ('NO', 'NOR', '578', 'Norway', 'Kingdom of Norway'),
  ('DK', 'DNK', '208', 'Denmark', 'Kingdom of Denmark'),
  ('FI', 'FIN', '246', 'Finland', 'Republic of Finland'),
  ('ES', 'ESP', '724', 'Spain', 'Kingdom of Spain'),
  ('IT', 'ITA', '380', 'Italy', 'Italian Republic'),
  ('PL', 'POL', '616', 'Poland', 'Republic of Poland'),
  ('RU', 'RUS', '643', 'Russia', 'Russian Federation')
ON CONFLICT (alpha2) DO NOTHING;

-- Seed Data for ISO Currencies (top 20)
INSERT INTO public.iso_currencies (code, numeric_code, name_en, minor_unit) VALUES
  ('SEK', '752', 'Swedish Krona', 2),
  ('USD', '840', 'US Dollar', 2),
  ('EUR', '978', 'Euro', 2),
  ('GBP', '826', 'Pound Sterling', 2),
  ('JPY', '392', 'Yen', 0),
  ('CNY', '156', 'Yuan Renminbi', 2),
  ('CHF', '756', 'Swiss Franc', 2),
  ('CAD', '124', 'Canadian Dollar', 2),
  ('AUD', '036', 'Australian Dollar', 2),
  ('NZD', '554', 'New Zealand Dollar', 2),
  ('NOK', '578', 'Norwegian Krone', 2),
  ('DKK', '208', 'Danish Krone', 2),
  ('INR', '356', 'Indian Rupee', 2),
  ('BRL', '986', 'Brazilian Real', 2),
  ('RUB', '643', 'Russian Ruble', 2),
  ('KRW', '410', 'Won', 0),
  ('MXN', '484', 'Mexican Peso', 2),
  ('ZAR', '710', 'Rand', 2),
  ('SGD', '702', 'Singapore Dollar', 2),
  ('HKD', '344', 'Hong Kong Dollar', 2)
ON CONFLICT (code) DO NOTHING;

-- Seed Data for Identifier Namespaces
INSERT INTO public.identifier_namespaces (namespace, label, issuer, scope, pattern, url_template) VALUES
  ('LEI', 'Legal Entity Identifier', 'GLEIF', 'global', '^[A-Z0-9]{20}$', 'https://search.gleif.org/#/record/{value}'),
  ('orgnr_se', 'Swedish Organization Number', 'Bolagsverket', 'SE', '^[0-9]{6}-[0-9]{4}$', 'https://www.bolagsverket.se/ff/foretagsformer/organisationsnummer/{value}'),
  ('SEC_CIK', 'SEC Central Index Key', 'SEC', 'US', '^[0-9]{10}$', 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={value}'),
  ('ISIN', 'International Securities Identification Number', 'ISO 6166', 'global', '^[A-Z]{2}[A-Z0-9]{10}$', NULL),
  ('ticker_MIC', 'Stock Ticker with Market Identifier Code', 'ISO 10383', 'global', '^[A-Z0-9]+:[A-Z]{4}$', NULL),
  ('DUNS', 'Dun & Bradstreet Number', 'Dun & Bradstreet', 'global', '^[0-9]{9}$', NULL),
  ('VAT_EU', 'EU VAT Number', 'EU', 'EU', '^[A-Z]{2}[A-Z0-9]+$', NULL)
ON CONFLICT (namespace) DO NOTHING;

-- Seed Data for Swedish Legal Forms
INSERT INTO public.picklist_legal_form (code, label, country_code) VALUES
  ('AB', 'Aktiebolag (Limited Company)', 'SE'),
  ('HB', 'Handelsbolag (General Partnership)', 'SE'),
  ('KB', 'Kommanditbolag (Limited Partnership)', 'SE'),
  ('EF', 'Enskild Firma (Sole Proprietorship)', 'SE'),
  ('BFL', 'Bank- eller finansbolag (Bank or Finance Company)', 'SE'),
  ('FAB', 'Försäkringsaktiebolag (Insurance Company)', 'SE'),
  ('SE', 'Europabolag (European Company)', 'SE'),
  ('SCE', 'Europakooperativ (European Cooperative)', 'SE'),
  ('Stiftelse', 'Stiftelse (Foundation)', 'SE'),
  ('Ideell', 'Ideell förening (Non-profit Association)', 'SE')
ON CONFLICT (code) DO NOTHING;

-- Seed Data for Company Statuses
INSERT INTO public.picklist_company_status (code, label) VALUES
  ('active', 'Active'),
  ('dormant', 'Dormant'),
  ('dissolved', 'Dissolved'),
  ('liquidation', 'In Liquidation'),
  ('bankruptcy', 'In Bankruptcy'),
  ('merged', 'Merged'),
  ('acquired', 'Acquired'),
  ('restructuring', 'In Restructuring')
ON CONFLICT (code) DO NOTHING;

-- Seed ISIC Rev.4 Top-Level Sections
DO $$
DECLARE
  v_isic_system_id UUID;
BEGIN
  -- Create ISIC code system
  INSERT INTO public.code_systems (name, version, kind, publisher, url)
  VALUES ('ISIC', 'Rev.4', 'industry', 'United Nations Statistics Division', 'https://unstats.un.org/unsd/classifications/Econ/isic')
  RETURNING code_system_id INTO v_isic_system_id;

  -- Insert top-level ISIC sections
  INSERT INTO public.taxonomy_nodes (code_system_id, code, label, path, level) VALUES
    (v_isic_system_id, 'A', 'Agriculture, forestry and fishing', 'A', 1),
    (v_isic_system_id, 'B', 'Mining and quarrying', 'B', 1),
    (v_isic_system_id, 'C', 'Manufacturing', 'C', 1),
    (v_isic_system_id, 'D', 'Electricity, gas, steam and air conditioning supply', 'D', 1),
    (v_isic_system_id, 'E', 'Water supply; sewerage, waste management', 'E', 1),
    (v_isic_system_id, 'F', 'Construction', 'F', 1),
    (v_isic_system_id, 'G', 'Wholesale and retail trade; repair of motor vehicles', 'G', 1),
    (v_isic_system_id, 'H', 'Transportation and storage', 'H', 1),
    (v_isic_system_id, 'I', 'Accommodation and food service activities', 'I', 1),
    (v_isic_system_id, 'J', 'Information and communication', 'J', 1),
    (v_isic_system_id, 'K', 'Financial and insurance activities', 'K', 1),
    (v_isic_system_id, 'L', 'Real estate activities', 'L', 1),
    (v_isic_system_id, 'M', 'Professional, scientific and technical activities', 'M', 1),
    (v_isic_system_id, 'N', 'Administrative and support service activities', 'N', 1),
    (v_isic_system_id, 'O', 'Public administration and defence; compulsory social security', 'O', 1),
    (v_isic_system_id, 'P', 'Education', 'P', 1),
    (v_isic_system_id, 'Q', 'Human health and social work activities', 'Q', 1),
    (v_isic_system_id, 'R', 'Arts, entertainment and recreation', 'R', 1),
    (v_isic_system_id, 'S', 'Other service activities', 'S', 1),
    (v_isic_system_id, 'T', 'Activities of households as employers', 'T', 1),
    (v_isic_system_id, 'U', 'Activities of extraterritorial organizations and bodies', 'U', 1);
END $$;
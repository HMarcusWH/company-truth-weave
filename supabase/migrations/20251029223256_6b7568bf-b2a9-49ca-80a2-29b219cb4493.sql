-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Create enum types
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.entity_type AS ENUM ('company', 'person', 'location', 'product', 'event');
CREATE TYPE public.doc_type AS ENUM ('filing', 'article', 'press_release', 'financial_report', 'other');
CREATE TYPE public.fact_status AS ENUM ('pending', 'verified', 'disputed', 'superseded');
CREATE TYPE public.ingestion_status AS ENUM ('pending', 'running', 'completed', 'failed');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Create entities table (companies, people, etc.)
CREATE TABLE public.entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type entity_type NOT NULL,
    legal_name CITEXT NOT NULL,
    trading_names JSONB DEFAULT '[]'::jsonb,
    identifiers JSONB DEFAULT '{}'::jsonb,
    addresses JSONB DEFAULT '[]'::jsonb,
    website TEXT,
    relationships JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create documents table
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    doc_type doc_type NOT NULL,
    entity_id UUID REFERENCES public.entities(id) ON DELETE CASCADE,
    entity_name CITEXT,
    published_date DATE,
    content_preview TEXT,
    full_text TEXT,
    source_url TEXT,
    storage_path TEXT,
    confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    embedding VECTOR(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create facts table (knowledge graph triples)
CREATE TABLE public.facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    object TEXT NOT NULL,
    confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
    status fact_status NOT NULL DEFAULT 'pending',
    evidence_doc_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    evidence_text TEXT,
    evidence_url TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create ingestion_runs table
CREATE TABLE public.ingestion_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_name TEXT NOT NULL,
    status ingestion_status NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    documents_processed INTEGER DEFAULT 0,
    facts_extracted INTEGER DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create validation_results table
CREATE TABLE public.validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fact_id UUID REFERENCES public.facts(id) ON DELETE CASCADE NOT NULL,
    validator_type TEXT NOT NULL,
    is_valid BOOLEAN NOT NULL,
    validation_score NUMERIC(3,2),
    issues JSONB DEFAULT '[]'::jsonb,
    validated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_results ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for entities (public read, authenticated write)
CREATE POLICY "Anyone can view entities"
ON public.entities FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert entities"
ON public.entities FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update entities"
ON public.entities FOR UPDATE
TO authenticated
USING (true);

-- RLS Policies for documents (public read, authenticated write)
CREATE POLICY "Anyone can view documents"
ON public.documents FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert documents"
ON public.documents FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update documents"
ON public.documents FOR UPDATE
TO authenticated
USING (true);

-- RLS Policies for facts (public read, authenticated write)
CREATE POLICY "Anyone can view facts"
ON public.facts FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert facts"
ON public.facts FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update facts"
ON public.facts FOR UPDATE
TO authenticated
USING (true);

-- RLS Policies for ingestion_runs
CREATE POLICY "Anyone can view ingestion runs"
ON public.ingestion_runs FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert ingestion runs"
ON public.ingestion_runs FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update ingestion runs"
ON public.ingestion_runs FOR UPDATE
TO authenticated
USING (true);

-- RLS Policies for validation_results
CREATE POLICY "Anyone can view validation results"
ON public.validation_results FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert validation results"
ON public.validation_results FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_entities_legal_name ON public.entities USING gin(legal_name gin_trgm_ops);
CREATE INDEX idx_entities_type ON public.entities(entity_type);
CREATE INDEX idx_documents_entity_id ON public.documents(entity_id);
CREATE INDEX idx_documents_doc_type ON public.documents(doc_type);
CREATE INDEX idx_documents_published_date ON public.documents(published_date DESC);
CREATE INDEX idx_documents_embedding ON public.documents USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_facts_subject ON public.facts(subject);
CREATE INDEX idx_facts_status ON public.facts(status);
CREATE INDEX idx_facts_evidence_doc_id ON public.facts(evidence_doc_id);
CREATE INDEX idx_ingestion_runs_status ON public.ingestion_runs(status);
CREATE INDEX idx_validation_results_fact_id ON public.validation_results(fact_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_entities_updated_at
    BEFORE UPDATE ON public.entities
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_facts_updated_at
    BEFORE UPDATE ON public.facts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Insert seed data
INSERT INTO public.entities (entity_type, legal_name, trading_names, identifiers, website)
VALUES 
    ('company', 'Acme Corporation', '["Acme Corp", "ACME"]'::jsonb, '{"lei": "ACME123456", "duns": "987654321"}'::jsonb, 'https://acme.example.com'),
    ('company', 'TechStart Inc.', '["TechStart"]'::jsonb, '{"lei": "TECH789012"}'::jsonb, 'https://techstart.example.com');

INSERT INTO public.documents (title, doc_type, entity_name, published_date, content_preview, confidence)
VALUES 
    ('Acme Q4 2024 Earnings Report', 'financial_report', 'Acme Corporation', '2024-12-15', 'Acme Corporation announced record earnings...', 0.95),
    ('TechStart Announces New Product', 'press_release', 'TechStart Inc.', '2024-10-20', 'TechStart Inc. today unveiled its revolutionary...', 0.88);

INSERT INTO public.facts (subject, predicate, object, confidence, status)
VALUES 
    ('Acme Corporation', 'revenue_2024_q4', '$50 million', 0.95, 'verified'),
    ('TechStart Inc.', 'founded', '2020', 0.92, 'verified'),
    ('Acme Corporation', 'ceo', 'Jane Smith', 0.88, 'pending');

INSERT INTO public.ingestion_runs (source_name, status, documents_processed, facts_extracted)
VALUES 
    ('SEC EDGAR', 'completed', 150, 3200),
    ('News API', 'running', 45, 890);
-- Create enum for site sources
CREATE TYPE public.site_source AS ENUM ('fapemig', 'finep', 'petrobras');

-- Create opportunities table
CREATE TABLE public.opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site site_source NOT NULL,
    name TEXT NOT NULL,
    deadline DATE,
    public TEXT,
    locale TEXT,
    url TEXT NOT NULL,
    description TEXT,
    category TEXT,
    fingerprint TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX idx_opportunities_site ON public.opportunities(site);
CREATE INDEX idx_opportunities_deadline ON public.opportunities(deadline);
CREATE INDEX idx_opportunities_fingerprint ON public.opportunities(fingerprint);
CREATE INDEX idx_opportunities_name ON public.opportunities USING gin(to_tsvector('portuguese', name));

-- Enable RLS (public data, read-only for everyone)
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

-- Allow public read access to opportunities
CREATE POLICY "Public read access to opportunities"
    ON public.opportunities
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- Function to update last_seen_at timestamp
CREATE OR REPLACE FUNCTION public.update_last_seen_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_seen_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update last_seen_at
CREATE TRIGGER update_opportunities_last_seen
    BEFORE UPDATE ON public.opportunities
    FOR EACH ROW
    EXECUTE FUNCTION public.update_last_seen_at();
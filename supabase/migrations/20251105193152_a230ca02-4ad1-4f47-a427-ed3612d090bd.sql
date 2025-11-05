-- Add RLS policies for edge functions to insert and update opportunities
-- Service role bypasses RLS, but these policies are good for documentation and future-proofing

CREATE POLICY "Service role can insert opportunities"
ON public.opportunities
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update opportunities"
ON public.opportunities
FOR UPDATE
TO service_role
USING (true);

-- Add index on fingerprint for faster lookups during deduplication
CREATE INDEX IF NOT EXISTS idx_opportunities_fingerprint ON public.opportunities(fingerprint);

-- Add index on site and last_seen_at for queries
CREATE INDEX IF NOT EXISTS idx_opportunities_site_last_seen ON public.opportunities(site, last_seen_at);
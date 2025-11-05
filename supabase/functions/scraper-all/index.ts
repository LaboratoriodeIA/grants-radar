import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    console.log('Starting all scrapers...');

    const scrapers = ['scraper-fapemig', 'scraper-finep', 'scraper-petrobras'];
    const results = [];

    // Run all scrapers in parallel
    const promises = scrapers.map(async (scraper) => {
      try {
        console.log(`Invoking ${scraper}...`);
        
        const { data, error } = await supabase.functions.invoke(scraper);
        
        if (error) {
          console.error(`Error invoking ${scraper}:`, error);
          return { scraper, success: false, error: error.message || String(error) };
        }
        
        console.log(`${scraper} completed:`, data);
        return { scraper, ...data };
      } catch (error) {
        console.error(`Exception invoking ${scraper}:`, error);
        return { scraper, success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    const scraperResults = await Promise.all(promises);
    
    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      scrapers: scraperResults,
      totals: {
        total: scraperResults.reduce((sum, r) => sum + (r.total || 0), 0),
        new: scraperResults.reduce((sum, r) => sum + (r.new || 0), 0),
        updated: scraperResults.reduce((sum, r) => sum + (r.updated || 0), 0),
      }
    };

    console.log('All scrapers completed:', summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Scraper orchestration error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

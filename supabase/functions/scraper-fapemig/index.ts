import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FapemigOpportunity {
  titulo?: string;
  title?: string;
  url?: string;
  link?: string;
  fim_date?: string;
  publico_alvo?: string[];
  publico?: string[];
  linhas_fomento?: string;
  categoria?: string;
  description?: string;
  anexos?: Array<{ url?: string }>;
}

async function makeFingerprint(site: string, name: string, url: string, deadline: string | null): Promise<string> {
  const raw = `${site}|${name.trim()}|${url}|${deadline || ''}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting FAPEMIG scraper...');

    // FAPEMIG API endpoint (public JSON API from their Nuxt app)
    const API_URL = 'https://fapemig.br/pt/editais-e-chamadas/?status=aberto';
    
    const response = await fetch(API_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EditaisBot/1.0)',
        'Accept': 'text/html,application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`FAPEMIG API returned ${response.status}`);
    }

    const html = await response.text();
    
    // Try to extract JSON data from the page (Nuxt often embeds data in __NUXT__ variable)
    const jsonMatch = html.match(/__NUXT_DATA__\s*=\s*(\[.*?\]);/s) || 
                      html.match(/window\.__NUXT__\s*=\s*({.*?});/s);
    
    let opportunities: FapemigOpportunity[] = [];
    
    if (jsonMatch) {
      try {
        const jsonData = JSON.parse(jsonMatch[1]);
        // Navigate the data structure to find opportunities
        opportunities = Array.isArray(jsonData) ? jsonData : 
                       jsonData.data?.items || jsonData.items || [];
      } catch (e) {
        console.error('Failed to parse embedded JSON:', e);
      }
    }

    // Fallback: scrape HTML if JSON extraction failed
    if (opportunities.length === 0) {
      console.log('Falling back to HTML scraping...');
      
      // Extract opportunity cards from HTML
      const cardRegex = /<article[^>]*class="[^"]*chamada[^"]*"[^>]*>(.*?)<\/article>/gs;
      const titleRegex = /<h[23][^>]*>(.*?)<\/h[23]>/s;
      const linkRegex = /<a[^>]*href="([^"]+)"/s;
      const dateRegex = /(\d{2}\/\d{2}\/\d{4})/;
      
      let match;
      while ((match = cardRegex.exec(html)) !== null) {
        const cardHtml = match[1];
        const titleMatch = titleRegex.exec(cardHtml);
        const linkMatch = linkRegex.exec(cardHtml);
        const dateMatch = dateRegex.exec(cardHtml);
        
        if (titleMatch && linkMatch) {
          opportunities.push({
            titulo: titleMatch[1].replace(/<[^>]*>/g, '').trim(),
            url: linkMatch[1],
            fim_date: dateMatch ? dateMatch[1] : undefined,
          });
        }
      }
    }

    console.log(`Found ${opportunities.length} opportunities from FAPEMIG`);

    let newCount = 0;
    let updatedCount = 0;

    for (const item of opportunities) {
      try {
        const name = (item.titulo || item.title || '').substring(0, 600).trim();
        if (!name) continue;

        const url = item.url || item.link || item.anexos?.[0]?.url || '';
        if (!url) continue;

        // Parse deadline
        let deadline: string | null = null;
        if (item.fim_date) {
          const parts = item.fim_date.split(/[\/\-]/);
          if (parts.length === 3) {
            // Assume DD/MM/YYYY or YYYY-MM-DD
            if (parts[0].length === 4) {
              deadline = item.fim_date; // Already ISO
            } else {
              deadline = `${parts[2]}-${parts[1]}-${parts[0]}`; // Convert to ISO
            }
          }
        }

        const publico = (item.publico_alvo || item.publico || []).join(', ') || null;
        const categoria = item.linhas_fomento || item.categoria || null;
        const description = item.description || null;

        const fingerprint = await makeFingerprint('fapemig', name, url, deadline);

        // Check if already exists
        const { data: existing } = await supabase
          .from('opportunities')
          .select('id')
          .eq('fingerprint', fingerprint)
          .single();

        if (existing) {
          const { error: updateError } = await supabase
            .from('opportunities')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', existing.id);
          
          if (updateError) {
            console.error('Error updating FAPEMIG opportunity:', updateError);
          } else {
            updatedCount++;
          }
        } else {
          const { error: insertError } = await supabase
            .from('opportunities')
            .insert({
              site: 'fapemig',
              name,
              url,
              deadline,
              public_info: publico,
              locale: 'MG',
              category: categoria,
              description,
              fingerprint,
            });
          
          if (insertError) {
            console.error('Error inserting FAPEMIG opportunity:', insertError);
          } else {
            console.log('Inserted new FAPEMIG opportunity:', name.substring(0, 100));
            newCount++;
          }
        }
      } catch (error) {
        console.error('Error processing opportunity:', error);
      }
    }

    const result = {
      success: true,
      source: 'fapemig',
      total: opportunities.length,
      new: newCount,
      updated: updatedCount,
      timestamp: new Date().toISOString(),
    };

    console.log('FAPEMIG scraper completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('FAPEMIG scraper error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      source: 'fapemig',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

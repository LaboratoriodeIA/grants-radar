import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function makeFingerprint(site: string, name: string, url: string, deadline: string | null): Promise<string> {
  const raw = `${site}|${name.trim()}|${url}|${deadline || ''}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseDate(text: string): string | null {
  const dateRegex = /(\d{2})\/(\d{2})\/(\d{4})/;
  const match = text.match(dateRegex);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return null;
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

    console.log('Starting Petrobras scraper...');

    // Petrobras has multiple pages for different types of calls
    const urls = [
      'https://petrobras.com.br/pt/sociedade-e-meio-ambiente/editais-abertos/',
      'https://petrobras.com.br/pt/nossas-atividades/tecnologia-e-inovacao/editais-de-pd-i/',
    ];

    const allOpportunities: Array<{name: string, url: string, deadline: string | null}> = [];

    for (const url of urls) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; EditaisBot/1.0)',
          },
        });

        if (!response.ok) {
          console.warn(`Petrobras URL ${url} returned ${response.status}`);
          continue;
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        
        if (!doc) continue;

        const selectors = [
          '.edital-card',
          '.card-edital',
          'article.edital',
          '.edital-item',
          'article[class*="edital"]',
          '.list-item',
        ];

        let cards: any[] = [];
        for (const selector of selectors) {
          const elements = doc.querySelectorAll(selector);
          if (elements.length > 0) {
            cards = Array.from(elements);
            console.log(`Found ${cards.length} cards from ${url} with selector: ${selector}`);
            break;
          }
        }

        for (const card of cards) {
          try {
            const titleElement = card.querySelector('h1, h2, h3, h4, .title, .edital-titulo');
            const linkElement = card.querySelector('a');
            
            if (!titleElement || !linkElement) continue;

            const name = titleElement.textContent.trim().substring(0, 600);
            const href = linkElement.getAttribute('href') || '';
            const fullUrl = href.startsWith('http') ? href : `https://petrobras.com.br${href}`;

            if (!name || !fullUrl) continue;

            const cardText = card.textContent;
            const deadline = parseDate(cardText);

            allOpportunities.push({ name, url: fullUrl, deadline });
          } catch (error) {
            console.error('Error processing card:', error);
          }
        }
      } catch (error) {
        console.error(`Error fetching ${url}:`, error);
      }
    }

    console.log(`Found ${allOpportunities.length} opportunities from Petrobras`);

    let newCount = 0;
    let updatedCount = 0;

    for (const opp of allOpportunities) {
      try {
        const fingerprint = await makeFingerprint('petrobras', opp.name, opp.url, opp.deadline);

        const { data: existing } = await supabase
          .from('opportunities')
          .select('id')
          .eq('fingerprint', fingerprint)
          .single();

        if (existing) {
          await supabase
            .from('opportunities')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', existing.id);
          updatedCount++;
        } else {
          await supabase
            .from('opportunities')
            .insert({
              site: 'petrobras',
              name: opp.name,
              url: opp.url,
              deadline: opp.deadline,
              public: null,
              locale: 'BR',
              category: null,
              description: null,
              fingerprint,
            });
          newCount++;
        }
      } catch (error) {
        console.error('Error processing opportunity:', error);
      }
    }

    const result = {
      success: true,
      source: 'petrobras',
      total: allOpportunities.length,
      new: newCount,
      updated: updatedCount,
      timestamp: new Date().toISOString(),
    };

    console.log('Petrobras scraper completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Petrobras scraper error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      source: 'petrobras',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

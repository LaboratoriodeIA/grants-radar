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

    console.log('Starting FINEP scraper...');

    const URL = 'https://www.finep.gov.br/chamadas-publicas';
    
    const response = await fetch(URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EditaisBot/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`FINEP returned ${response.status}`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (!doc) {
      throw new Error('Failed to parse HTML');
    }

    // Find opportunity cards - FINEP uses various selectors depending on their CMS
    const selectors = [
      '.chamada-item',
      '.edital-item',
      'article.chamada',
      '.card.chamada',
      'article[class*="chamada"]',
      '.entry-content article',
    ];

    let cards: any[] = [];
    for (const selector of selectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        cards = Array.from(elements);
        console.log(`Found ${cards.length} cards with selector: ${selector}`);
        break;
      }
    }

    console.log(`Found ${cards.length} opportunities from FINEP`);

    let newCount = 0;
    let updatedCount = 0;

    for (const card of cards) {
      try {
        const titleElement = card.querySelector('h1, h2, h3, h4, .title, .chamada-titulo');
        const linkElement = card.querySelector('a');
        
        if (!titleElement || !linkElement) continue;

        const name = titleElement.textContent.trim().substring(0, 600);
        const href = linkElement.getAttribute('href') || '';
        const url = href.startsWith('http') ? href : `https://www.finep.gov.br${href}`;

        if (!name || !url) continue;

        const cardText = card.textContent;
        const deadline = parseDate(cardText);

        const fingerprint = await makeFingerprint('finep', name, url, deadline);

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
            console.error('Error updating FINEP opportunity:', updateError);
          } else {
            updatedCount++;
          }
        } else {
          const { error: insertError } = await supabase
            .from('opportunities')
            .insert({
              site: 'finep',
              name,
              url,
              deadline,
              public_info: null,
              locale: 'BR',
              category: null,
              description: null,
              fingerprint,
            });
          
          if (insertError) {
            console.error('Error inserting FINEP opportunity:', insertError);
          } else {
            console.log('Inserted new FINEP opportunity:', name.substring(0, 100));
            newCount++;
          }
        }
      } catch (error) {
        console.error('Error processing FINEP opportunity:', error);
      }
    }

    const result = {
      success: true,
      source: 'finep',
      total: cards.length,
      new: newCount,
      updated: updatedCount,
      timestamp: new Date().toISOString(),
    };

    console.log('FINEP scraper completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('FINEP scraper error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      source: 'finep',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': getUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(30000),
      });
      
      if (response.ok) return response;
      
      console.warn(`Attempt ${i + 1}/${maxRetries}: Status ${response.status}`);
    } catch (error) {
      console.error(`Attempt ${i + 1}/${maxRetries} failed:`, error);
    }
    
    if (i < maxRetries - 1) {
      const delay = Math.pow(2, i + 1) * 1000;
      console.log(`Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error(`Failed to fetch ${url} after ${maxRetries} attempts`);
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

function parseDate(text: string): string | null {
  const patterns = [
    /(\d{2})\/(\d{2})\/(\d{4})/,
    /até\s+(\d{2})\/(\d{2})\/(\d{4})/i,
    /prazo[:\s]+(\d{2})\/(\d{2})\/(\d{4})/i,
    /encerramento[:\s]+(\d{2})\/(\d{2})\/(\d{4})/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const groups = match.slice(1).filter(Boolean);
      if (groups.length === 3) {
        return `${groups[2]}-${groups[1]}-${groups[0]}`;
      }
    }
  }
  return null;
}

function validateOpportunity(opp: any): boolean {
  if (!opp.name || opp.name.length < 5) {
    console.warn('Invalid name:', opp.name);
    return false;
  }
  
  if (!opp.url || !opp.url.startsWith('http')) {
    console.warn('Invalid URL:', opp.url);
    return false;
  }
  
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('=== INÍCIO DO SCRAPER FINEP ===');
    console.log('Timestamp:', new Date().toISOString());

    const URL = 'http://www.finep.gov.br/chamadas-publicas?situacao=aberta';
    console.log('URL:', URL);
    
    console.log('\n--- FETCH ---');
    const response = await fetchWithRetry(URL);
    console.log('Status:', response.status);

    const html = await response.text();
    console.log('HTML size:', Math.round(html.length / 1024), 'KB');
    console.log('HTML preview:', html.substring(0, 300));
    
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (!doc) {
      throw new Error('Failed to parse HTML');
    }

    console.log('\n--- PARSING ---');
    
    const selectors = [
      'form h3 a',
      'form div h3',
      'form .chamada-item',
      '.chamada-item',
      '.edital-item',
      'article.chamada',
      '.card.chamada',
      'article[class*="chamada"]',
      '.entry-content article',
      'h3 a',
      'h2 a',
    ];

    let cards: any[] = [];
    for (const selector of selectors) {
      console.log(`Testing selector: ${selector}`);
      const elements = doc.querySelectorAll(selector);
      console.log(`Found ${elements.length} elements`);
      
      if (elements.length > 0) {
        cards = Array.from(elements);
        console.log(`✓ Using selector: ${selector} (${cards.length} elements)`);
        break;
      }
    }

    console.log(`\n--- PROCESSING ${cards.length} OPPORTUNITIES ---`);

    let newCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const card of cards) {
      try {
        let name = '';
        let href = '';
        let deadline: string | null = null;

        if (card.tagName === 'A') {
          name = card.textContent.trim();
          href = card.getAttribute('href') || '';
          const parentText = card.parentElement?.parentElement?.textContent || '';
          deadline = parseDate(parentText);
        } else {
          const titleElement = card.querySelector('h1, h2, h3, h4, .title, .chamada-titulo');
          const linkElement = card.querySelector('a');
          
          if (!titleElement || !linkElement) {
            console.warn('Missing title or link element in card');
            continue;
          }

          name = titleElement.textContent.trim().substring(0, 600);
          href = linkElement.getAttribute('href') || '';
          const cardText = card.textContent;
          deadline = parseDate(cardText);
        }

        const url = href.startsWith('http') ? href : `http://www.finep.gov.br${href}`;

        if (!validateOpportunity({ name, url })) {
          errorCount++;
          continue;
        }

        console.log(`Processing: ${name.substring(0, 80)}...`);
        console.log(`URL: ${url}`);
        console.log(`Deadline: ${deadline || 'N/A'}`);

        const fingerprint = await makeFingerprint('finep', name, url, deadline);

        const { data: existing, error: selectError } = await supabase
          .from('opportunities')
          .select('id')
          .eq('fingerprint', fingerprint)
          .maybeSingle();

        if (selectError) {
          console.error('Error checking existing opportunity:', selectError);
          errorCount++;
          continue;
        }

        if (existing) {
          const { error: updateError } = await supabase
            .from('opportunities')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('id', existing.id);
          
          if (updateError) {
            console.error('Error updating FINEP opportunity:', updateError);
            errorCount++;
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
            errorCount++;
          } else {
            console.log('✓ Inserted:', name.substring(0, 60));
            newCount++;
          }
        }
      } catch (error) {
        console.error('Error processing FINEP opportunity:', error);
        errorCount++;
      }
    }

    const executionTime = Date.now() - startTime;

    const result = {
      success: true,
      source: 'finep',
      total: cards.length,
      new: newCount,
      updated: updatedCount,
      skipped: cards.length - newCount - updatedCount,
      errors: errorCount,
      execution_time_ms: executionTime,
      timestamp: new Date().toISOString(),
    };

    console.log('\n=== RESULTADO FINEP ===');
    console.log('Total encontrado:', result.total);
    console.log('Novos:', result.new);
    console.log('Atualizados:', result.updated);
    console.log('Erros:', result.errors);
    console.log('Tempo de execução:', executionTime, 'ms');

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('FINEP scraper error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      source: 'finep',
      execution_time_ms: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

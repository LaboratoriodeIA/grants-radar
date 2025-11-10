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

    console.log('=== INÍCIO DO SCRAPER FAPEMIG ===');
    console.log('Timestamp:', new Date().toISOString());

    const API_URL = 'https://fapemig.br/oportunidades/chamadas-e-editais?status=abertas';
    console.log('URL:', API_URL);
    
    console.log('\n--- FETCH ---');
    const response = await fetchWithRetry(API_URL);
    console.log('Status:', response.status);

    const html = await response.text();
    console.log('HTML size:', Math.round(html.length / 1024), 'KB');
    console.log('HTML preview:', html.substring(0, 300));
    
    console.log('\n--- PARSING ---');
    
    let opportunities: FapemigOpportunity[] = [];
    
    // Parse HTML with DOMParser
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    if (!doc) {
      throw new Error('Failed to parse HTML');
    }

    console.log('DOM parsed successfully');
    
    // Look for all links that point to individual opportunities
    const links = Array.from(doc.querySelectorAll('a[href*="/oportunidades/chamadas-e-editais/"]'));
    console.log(`Found ${links.length} opportunity links`);
    
    for (const linkNode of links) {
      try {
        const link = linkNode as any; // Cast to Element type
        const href = link.getAttribute('href');
        if (!href || href.includes('?') || href.endsWith('/chamadas-e-editais')) {
          continue; // Skip filter links and the main page link
        }
        
        // Find the parent card/article containing this link
        let card = link.closest('article, section, div[class*="card"]');
        if (!card) {
          // Try to get the parent element up to 5 levels
          let parent = link.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const className = parent.getAttribute?.('class') || '';
            if (className.includes('card') || className.includes('item') || parent.tagName === 'ARTICLE') {
              card = parent;
              break;
            }
            parent = parent.parentElement;
          }
        }
        
        if (!card) continue;
        
        const cardText = card.textContent || '';
        
        // Extract title - look for h1-h6 in the card
        const titleElement = card.querySelector('h1, h2, h3, h4, h5, h6');
        const titulo = titleElement ? titleElement.textContent?.trim() : link.textContent?.trim();
        
        if (!titulo || titulo.length < 10) continue;
        
        // Extract deadline - look for date patterns
        let fim_date: string | undefined;
        const datePatterns = [
          /Submissão até[:\s]*(\d{1,2}\s+de\s+\w+\.?\s+de\s+\d{4})/i,
          /até[:\s]*(\d{1,2}\s+de\s+\w+\.?\s+de\s+\d{4})/i,
          /(\d{1,2}\s+de\s+\w+\.?\s+de\s+\d{4})/,
          /(\d{2}\/\d{2}\/\d{4})/,
        ];
        
        for (const pattern of datePatterns) {
          const match = cardText.match(pattern);
          if (match) {
            fim_date = match[1];
            break;
          }
        }
        
        opportunities.push({
          titulo: titulo.substring(0, 600),
          url: href,
          fim_date,
        });
        
        console.log(`Found: ${titulo.substring(0, 60)}...`);
      } catch (error) {
        console.error('Error processing link:', error);
      }
    }

    console.log(`\n--- PROCESSING ${opportunities.length} OPPORTUNITIES ---`);

    let newCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const item of opportunities) {
      try {
        const name = (item.titulo || item.title || '').substring(0, 600).trim();
        if (!name) {
          console.warn('Skipping opportunity with no name');
          continue;
        }

        let url = item.url || item.link || item.anexos?.[0]?.url || '';
        if (!url) {
          console.warn('Skipping opportunity with no URL');
          continue;
        }

        // Normalize URL
        url = url.startsWith('http') 
          ? url 
          : url.startsWith('/') 
            ? `https://fapemig.br${url}`
            : `https://fapemig.br/oportunidades/${url}`;

        if (!validateOpportunity({ name, url })) {
          errorCount++;
          continue;
        }

        // Parse deadline
        let deadline: string | null = null;
        if (item.fim_date) {
          // Handle Brazilian date formats like "25 de nov. de 2025"
          const monthMap: Record<string, string> = {
            'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
            'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
            'set': '09', 'out': '10', 'nov': '11', 'dez': '12',
          };
          
          // Try format: "DD de MMM de YYYY"
          const brDateMatch = item.fim_date.match(/(\d{1,2})\s+de\s+(\w+)\.?\s+de\s+(\d{4})/i);
          if (brDateMatch) {
            const day = brDateMatch[1].padStart(2, '0');
            const monthAbbr = brDateMatch[2].toLowerCase().substring(0, 3);
            const month = monthMap[monthAbbr] || '01';
            const year = brDateMatch[3];
            deadline = `${year}-${month}-${day}`;
          } else {
            // Try format: DD/MM/YYYY
            const dateOnly = item.fim_date.split(' ')[0];
            const parts = dateOnly.split(/[\/\-]/);
            if (parts.length === 3) {
              if (parts[0].length === 4) {
                deadline = dateOnly;
              } else {
                deadline = `${parts[2]}-${parts[1]}-${parts[0]}`;
              }
            }
          }
        }

        const publico = (item.publico_alvo || item.publico || []).join(', ') || null;
        const categoria = item.linhas_fomento || item.categoria || null;
        const description = item.description || null;

        console.log(`Processing: ${name.substring(0, 60)}...`);
        console.log(`URL: ${url}`);
        console.log(`Deadline: ${deadline || 'N/A'}`);

        const fingerprint = await makeFingerprint('fapemig', name, url, deadline);

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
            console.error('Error updating FAPEMIG opportunity:', updateError);
            errorCount++;
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
            errorCount++;
          } else {
            console.log('✓ Inserted:', name.substring(0, 60));
            newCount++;
          }
        }
      } catch (error) {
        console.error('Error processing opportunity:', error);
        errorCount++;
      }
    }

    const executionTime = Date.now() - startTime;

    const result = {
      success: true,
      source: 'fapemig',
      total: opportunities.length,
      new: newCount,
      updated: updatedCount,
      skipped: opportunities.length - newCount - updatedCount,
      errors: errorCount,
      execution_time_ms: executionTime,
      timestamp: new Date().toISOString(),
    };

    console.log('\n=== RESULTADO FAPEMIG ===');
    console.log('Total encontrado:', result.total);
    console.log('Novos:', result.new);
    console.log('Atualizados:', result.updated);
    console.log('Erros:', result.errors);
    console.log('Tempo de execução:', executionTime, 'ms');

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('FAPEMIG scraper error:', error);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      source: 'fapemig',
      execution_time_ms: Date.now() - startTime,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

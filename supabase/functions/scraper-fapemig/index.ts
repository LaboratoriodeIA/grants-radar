import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
          'Accept': 'application/json',
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

interface FapemigApiCall {
  id: number;
  title: string;
  fields: {
    numero?: string;
    titulo?: string;
    status?: string;
    ativo?: string;
    valor?: string;
    descricao_chamada?: string;
    quem_pode_participar?: string;
    o_que_pode_ser_financiado?: string;
    requisitos_submissao?: string;
    criterios_avaliacao?: string;
    areas_conhecimento?: string[];
    linhas_fomento?: string[];
    publico_alvo?: string[];
    submissao?: Array<{
      description?: string;
      inicio_date?: string;
      fim_date?: string;
    }>;
    divulgacao?: Array<{
      description?: string;
      inicio_date?: string;
      fim_date?: string;
      resultado_final?: boolean;
    }>;
    anexos?: Array<{
      anexo_id: number | string;
      url: string;
      filename: string;
    }>;
  };
}

interface FapemigApiResponse {
  data: FapemigApiCall[];
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

function validateDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  
  // API já retorna datas em formato ISO (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return deadline;
  }
  
  console.warn('Unexpected deadline format:', deadline);
  return null;
}

function mapApiCallToOpportunity(apiCall: FapemigApiCall) {
  const fields = apiCall.fields;
  
  // Construct URL da página web
  const url = `https://fapemig.br/oportunidades/chamadas-e-editais/${apiCall.id}`;
  
  // Extract deadline from submissao array (fim_date)
  let deadline: string | null = null;
  if (fields.submissao && fields.submissao.length > 0) {
    const submissao = fields.submissao[0];
    deadline = validateDeadline(submissao.fim_date || null);
  }
  
  // Build category from linhas_fomento + areas_conhecimento
  const categoryParts: string[] = [];
  if (fields.linhas_fomento && fields.linhas_fomento.length > 0) {
    categoryParts.push(fields.linhas_fomento.join(', '));
  }
  if (fields.areas_conhecimento && fields.areas_conhecimento.length > 0) {
    categoryParts.push(fields.areas_conhecimento.slice(0, 3).join(', '));
  }
  const category = categoryParts.length > 0 
    ? categoryParts.join(' | ').substring(0, 255) 
    : null;
  
  // Build target_audience from publico_alvo
  const target_audience = fields.publico_alvo && fields.publico_alvo.length > 0
    ? fields.publico_alvo.join(', ')
    : null;
  
  // Build description from multiple fields
  const descriptionParts: string[] = [];
  if (fields.descricao_chamada) {
    descriptionParts.push(`**Descrição:** ${fields.descricao_chamada}`);
  }
  if (fields.quem_pode_participar) {
    descriptionParts.push(`**Quem pode participar:** ${fields.quem_pode_participar}`);
  }
  if (fields.o_que_pode_ser_financiado) {
    descriptionParts.push(`**O que pode ser financiado:** ${fields.o_que_pode_ser_financiado}`);
  }
  if (fields.valor) {
    descriptionParts.push(`**Valor:** R$ ${fields.valor}`);
  }
  const description = descriptionParts.length > 0
    ? descriptionParts.join('\n\n').substring(0, 2000)
    : null;
  
  // Use titulo from fields or title
  const name = (fields.titulo || apiCall.title || '').substring(0, 600).trim();
  
  return {
    site: 'fapemig',
    name,
    url,
    deadline,
    category,
    description,
    target_audience,
    locale: 'MG',
    public_info: null,
  };
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

    console.log('=== FAPEMIG SCRAPER - API MODE ===');
    console.log('Timestamp:', new Date().toISOString());

    const API_URL = 'https://fapemig.br/api/calls';
    console.log('API URL:', API_URL);
    
    console.log('\n--- API REQUEST ---');
    const response = await fetchWithRetry(API_URL);
    console.log('API Status:', response.status);
    console.log('Content-Type:', response.headers.get('content-type'));

    if (!response.ok) {
      throw new Error(`API returned status ${response.status}: ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      console.error('Unexpected content-type:', contentType);
      const text = await response.text();
      console.error('Response preview:', text.substring(0, 500));
      throw new Error(`Expected JSON but got ${contentType}`);
    }

    console.log('\n--- API RESPONSE ---');
    const apiResponse: FapemigApiResponse = await response.json();
    console.log('Total calls in API:', apiResponse.data.length);
    
    console.log('\n--- FILTERING ---');
    const openCalls = apiResponse.data.filter(call => {
      const status = call.fields.status?.toLowerCase() || '';
      const ativo = call.fields.ativo?.toLowerCase() || '';
      return (status === 'abertas') && (ativo === 'sim');
    });
    console.log('Open calls found:', openCalls.length);
    
    console.log('\n--- MAPPING ---');
    const opportunities = openCalls.map(mapApiCallToOpportunity);
    console.log('Valid opportunities:', opportunities.length);

    console.log('\n--- DATABASE OPERATIONS ---');
    let newCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const opp of opportunities) {
      try {
        if (!validateOpportunity(opp)) {
          errorCount++;
          continue;
        }

        const fingerprint = await makeFingerprint(
          opp.site, 
          opp.name, 
          opp.url, 
          opp.deadline
        );

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
            console.error('Error updating opportunity:', updateError);
            errorCount++;
          } else {
            updatedCount++;
          }
        } else {
          const { error: insertError } = await supabase
            .from('opportunities')
            .insert({
              ...opp,
              fingerprint,
            });
          
          if (insertError) {
            console.error('Error inserting opportunity:', insertError);
            errorCount++;
          } else {
            console.log('✓ Inserted:', opp.name.substring(0, 60));
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

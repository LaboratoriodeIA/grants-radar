import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Play, RefreshCw, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AdminPanel() {
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);

  const runScraper = async (scraper: string) => {
    setLoading(scraper);
    setResults(null);

    try {
      toast.info(`Executando coletor: ${scraper}...`);
      
      const { data, error } = await supabase.functions.invoke(scraper);

      if (error) {
        toast.error(`Erro ao executar ${scraper}: ${error.message}`);
        setResults({ success: false, error: error.message });
      } else {
        toast.success(`${scraper} concluído com sucesso!`);
        setResults(data);
      }
    } catch (error: any) {
      toast.error(`Erro: ${error.message}`);
      setResults({ success: false, error: error.message });
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card className="p-6 border-2 border-primary/20">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <RefreshCw className="w-6 h-6 text-primary" />
          Painel de Administração
        </h2>
        <p className="text-muted-foreground mt-1">
          Execute os coletores de dados manualmente
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Button
          onClick={() => runScraper('scraper-fapemig')}
          disabled={loading !== null}
          className="h-20 text-lg"
          variant="outline"
        >
          {loading === 'scraper-fapemig' ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Play className="w-5 h-5 mr-2" />
          )}
          Coletar FAPEMIG
        </Button>

        <Button
          onClick={() => runScraper('scraper-finep')}
          disabled={loading !== null}
          className="h-20 text-lg"
          variant="outline"
        >
          {loading === 'scraper-finep' ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Play className="w-5 h-5 mr-2" />
          )}
          Coletar FINEP
        </Button>

        <Button
          onClick={() => runScraper('scraper-petrobras')}
          disabled={loading !== null}
          className="h-20 text-lg"
          variant="outline"
        >
          {loading === 'scraper-petrobras' ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <Play className="w-5 h-5 mr-2" />
          )}
          Coletar Petrobras
        </Button>

        <Button
          onClick={() => runScraper('scraper-all')}
          disabled={loading !== null}
          className="h-20 text-lg bg-primary hover:bg-primary-hover"
        >
          {loading === 'scraper-all' ? (
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
          ) : (
            <RefreshCw className="w-5 h-5 mr-2" />
          )}
          Coletar Todos
        </Button>
      </div>

      {results && (
        <Card className="p-4 bg-muted/30">
          <div className="flex items-center gap-2 mb-3">
            {results.success ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-destructive" />
            )}
            <h3 className="font-semibold">
              {results.success ? "Sucesso" : "Erro"}
            </h3>
          </div>

          {results.success && (
            <div className="space-y-2 text-sm">
              {results.scrapers ? (
                // Result from scraper-all
                <>
                  <div className="flex gap-2">
                    <Badge variant="outline">Total: {results.totals.total}</Badge>
                    <Badge className="bg-green-100 text-green-800">
                      Novos: {results.totals.new}
                    </Badge>
                    <Badge className="bg-blue-100 text-blue-800">
                      Atualizados: {results.totals.updated}
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-1">
                    {results.scrapers.map((s: any, i: number) => (
                      <div key={i} className="text-xs text-muted-foreground">
                        {s.scraper}: {s.new || 0} novos, {s.updated || 0} atualizados
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                // Result from individual scraper
                <div className="flex gap-2">
                  <Badge variant="outline">Total: {results.total}</Badge>
                  <Badge className="bg-green-100 text-green-800">
                    Novos: {results.new}
                  </Badge>
                  <Badge className="bg-blue-100 text-blue-800">
                    Atualizados: {results.updated}
                  </Badge>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {new Date(results.timestamp).toLocaleString('pt-BR')}
              </p>
            </div>
          )}

          {!results.success && (
            <p className="text-sm text-destructive">{results.error}</p>
          )}
        </Card>
      )}
    </Card>
  );
}

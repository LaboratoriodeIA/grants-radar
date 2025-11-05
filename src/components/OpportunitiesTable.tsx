import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Calendar, MapPin, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Opportunity {
  id: string;
  site: string;
  name: string;
  deadline: string | null;
  public_info: string | null;
  locale: string | null;
  url: string;
  description: string | null;
  category: string | null;
  created_at: string;
}

interface OpportunitiesTableProps {
  searchQuery: string;
  siteFilter: string;
}

const siteColors: Record<string, string> = {
  fapemig: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  finep: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  petrobras: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

const siteName: Record<string, string> = {
  fapemig: "FAPEMIG",
  finep: "FINEP",
  petrobras: "Petrobras",
};

export function OpportunitiesTable({ searchQuery, siteFilter }: OpportunitiesTableProps) {
  const { data: opportunities, isLoading } = useQuery({
    queryKey: ["opportunities", searchQuery, siteFilter],
    queryFn: async () => {
      let query = supabase
        .from("opportunities")
        .select("*")
        .order("deadline", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (siteFilter && siteFilter !== "all") {
        query = query.eq("site", siteFilter as "fapemig" | "finep" | "petrobras");
      }

      if (searchQuery) {
        query = query.or(
          `name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`
        );
      }

      const { data, error } = await query.limit(200);

      if (error) throw error;
      return data as Opportunity[];
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="p-6">
            <Skeleton className="h-6 w-3/4 mb-3" />
            <Skeleton className="h-4 w-1/2 mb-2" />
            <Skeleton className="h-4 w-1/3" />
          </Card>
        ))}
      </div>
    );
  }

  if (!opportunities || opportunities.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground text-lg">
          Nenhum edital encontrado com os filtros aplicados.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {opportunities.map((opportunity) => (
        <Card
          key={opportunity.id}
          className="p-6 hover:shadow-lg transition-all duration-300 border-l-4 border-l-primary"
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-start gap-3 flex-wrap">
                <Badge className={siteColors[opportunity.site] || "bg-gray-100"}>
                  {siteName[opportunity.site] || opportunity.site.toUpperCase()}
                </Badge>
                {opportunity.category && (
                  <Badge variant="outline" className="text-xs">
                    {opportunity.category}
                  </Badge>
                )}
              </div>

              <h3 className="text-xl font-semibold text-foreground leading-tight">
                {opportunity.name}
              </h3>

              {opportunity.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {opportunity.description}
                </p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {opportunity.deadline && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span>
                      Prazo:{" "}
                      <span className="font-medium text-foreground">
                        {format(new Date(opportunity.deadline), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </span>
                    </span>
                  </div>
                )}

                {opportunity.locale && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span>{opportunity.locale}</span>
                  </div>
                )}

                {opportunity.public_info && (
                  <div className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-primary" />
                    <span className="line-clamp-1">{opportunity.public_info}</span>
                  </div>
                )}
              </div>
            </div>

            <a
              href={opportunity.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary-hover transition-colors whitespace-nowrap font-medium shadow-sm"
            >
              Acessar Edital
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </Card>
      ))}
    </div>
  );
}

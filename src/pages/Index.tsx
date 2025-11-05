import { useState } from "react";
import { SearchFilters } from "@/components/SearchFilters";
import { OpportunitiesTable } from "@/components/OpportunitiesTable";
import { AdminPanel } from "@/components/AdminPanel";
import { Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-primary to-accent rounded-xl shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
                Editais de Inovação
              </h1>
              <p className="text-muted-foreground mt-1 text-sm sm:text-base">
                Oportunidades de financiamento para pesquisa e desenvolvimento
              </p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="opportunities" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
            <TabsTrigger value="admin">Administração</TabsTrigger>
          </TabsList>

          <TabsContent value="opportunities" className="space-y-8">
            {/* Filters */}
            <SearchFilters
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              siteFilter={siteFilter}
              setSiteFilter={setSiteFilter}
            />

            {/* Results */}
            <OpportunitiesTable searchQuery={searchQuery} siteFilter={siteFilter} />
          </TabsContent>

          <TabsContent value="admin">
            <AdminPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Index;

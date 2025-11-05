import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SearchFiltersProps {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  siteFilter: string;
  setSiteFilter: (value: string) => void;
}

export function SearchFilters({ 
  searchQuery, 
  setSearchQuery, 
  siteFilter, 
  setSiteFilter 
}: SearchFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <Input
          placeholder="Buscar por nome, categoria ou descrição..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-12 text-base shadow-sm"
        />
      </div>

      <Select value={siteFilter} onValueChange={setSiteFilter}>
        <SelectTrigger className="w-full sm:w-48 h-12 text-base shadow-sm">
          <SelectValue placeholder="Filtrar por fonte" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as fontes</SelectItem>
          <SelectItem value="fapemig">FAPEMIG</SelectItem>
          <SelectItem value="finep">FINEP</SelectItem>
          <SelectItem value="petrobras">Petrobras</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

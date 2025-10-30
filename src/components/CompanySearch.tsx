import { useEffect, useMemo, useState } from "react";
import { Search, Building2, MapPin, Link2, Globe, Calendar, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

// Types for normalized company shape used by the UI
type Company = {
  id: string;
  legal_name: string;
  status: string;
  trading_names: string[];
  legal_form?: string;
  founded_on?: string;
  website?: string;
  identifiers: { type: string; value: string; verified?: boolean }[];
  addresses: { type: string; lines: string[]; locality?: string; country?: string }[];
  relationships: { type: string; entity: string; count: number }[];
};

export const CompanySearch = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const q = searchQuery.trim();
      let query = (supabase as any)
        .from('entities')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (q) {
        query = query.ilike('legal_name', `%${q}%`);
      }

      const { data, error } = await query;
      if (error) {
        toast({ title: 'Failed to load companies', description: error.message } as any);
        return;
      }
      if (cancelled) return;

      const mapped: Company[] = (data ?? []).map((row: any) => ({
        id: row.id,
        legal_name: row.legal_name,
        status: 'active',
        trading_names: Array.isArray(row.trading_names) ? row.trading_names : [],
        legal_form: row.entity_type || 'Company',
        founded_on: undefined,
        website: row.website,
        identifiers: Object.entries(row.identifiers || {}).map(([type, value]) => ({ type, value: String(value), verified: true })),
        addresses: Array.isArray(row.addresses) ? row.addresses : [],
        relationships: Array.isArray(row.relationships) ? row.relationships : [],
      }));

      setCompanies(mapped);
    };

    const t = setTimeout(load, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchQuery]);

  const filteredCompanies = companies;

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      {/* Search Panel */}
      <div className="space-y-4">
        <Card className="p-6 shadow-sm">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies by name, ID, or domain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
        </Card>

        <div className="space-y-2">
          {filteredCompanies.map((company) => (
            <Card
              key={company.id}
              className={`p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5 active:scale-[0.98] ${
                selectedCompany?.id === company.id ? "border-primary bg-primary/5 shadow-md" : "hover:bg-accent/50"
              }`}
              onClick={() => setSelectedCompany(company)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="h-4 w-4 text-primary flex-shrink-0" />
                    <h3 className="font-semibold text-sm truncate">{company.legal_name}</h3>
                  </div>
                  {company.trading_names.length > 0 && (
                    <p className="text-xs text-muted-foreground mb-2">
                      Also known as: {company.trading_names.join(", ")}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">
                      {company.legal_form}
                    </Badge>
                    <Badge variant={company.status === "active" ? "default" : "secondary"} className="text-xs">
                      {company.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Detail Panel */}
      <div>
        {selectedCompany ? (
          <Card className="p-6">
            <div className="space-y-6">
              {/* Header */}
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground mb-1">
                      {selectedCompany.legal_name}
                    </h2>
                    {selectedCompany.trading_names.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Trading as: {selectedCompany.trading_names.join(", ")}
                      </p>
                    )}
                  </div>
                  <Badge variant={selectedCompany.status === "active" ? "default" : "secondary"}>
                    {selectedCompany.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Founded {selectedCompany.founded_on}
                  </span>
                  <span>{selectedCompany.legal_form}</span>
                </div>
              </div>

              <Separator />

              {/* Identifiers */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Verified Identifiers
                </h3>
                <div className="grid gap-2">
                  {selectedCompany.identifiers.map((id, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">{id.type}</span>
                        <p className="font-mono text-sm">{id.value}</p>
                      </div>
                      {id.verified && (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Addresses */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Registered Addresses
                </h3>
                <div className="space-y-2">
                  {selectedCompany.addresses.map((addr, idx) => (
                    <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                      <Badge variant="outline" className="text-xs mb-2">{addr.type}</Badge>
                      <p className="text-sm">{addr.lines.join(", ")}</p>
                      <p className="text-sm text-muted-foreground">
                        {addr.locality}, {addr.country}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Website */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Web Presence
                </h3>
                <a
                  href={selectedCompany.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:text-accent-hover underline"
                >
                  {selectedCompany.website}
                </a>
              </div>

              {/* Relationships */}
              {selectedCompany.relationships.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      Corporate Structure
                    </h3>
                    <div className="space-y-2">
                      {selectedCompany.relationships.map((rel, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div>
                            <Badge variant="outline" className="text-xs mb-1">{rel.type}</Badge>
                            <p className="text-sm font-medium">{rel.entity}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{rel.count} entities</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        ) : (
          <Card className="p-16 bg-gradient-to-br from-muted/30 to-muted/10">
            <div className="text-center text-muted-foreground">
              <div className="h-20 w-20 mx-auto mb-6 rounded-full bg-muted/50 flex items-center justify-center">
                <Search className="h-10 w-10 opacity-40" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Company Selected</h3>
              <p className="text-sm">Select a company from the list to view detailed information</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

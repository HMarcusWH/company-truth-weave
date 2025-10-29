import { useState } from "react";
import { Search, Building2, MapPin, Link2, Globe, Calendar, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Mock data - in production this would come from your PostgreSQL + pgvector
const mockCompanies = [
  {
    id: "1",
    legal_name: "Acme Corporation Ltd",
    trading_names: ["ACME", "Acme Tech"],
    status: "active",
    legal_form: "Limited Company",
    founded_on: "2010-03-15",
    website: "https://acme.example.com",
    identifiers: [
      { type: "LEI", value: "123456789012ABCDEFGH", verified: true },
      { type: "VAT", value: "GB123456789", verified: true }
    ],
    addresses: [
      {
        type: "registered",
        lines: ["123 Tech Street"],
        locality: "London",
        country: "GB"
      }
    ],
    relationships: [
      { type: "subsidiary", entity: "Acme Labs Inc", count: 3 }
    ]
  },
  {
    id: "2",
    legal_name: "Global Industries PLC",
    trading_names: ["GI Group"],
    status: "active",
    legal_form: "Public Limited Company",
    founded_on: "1995-06-20",
    website: "https://globalindustries.example.com",
    identifiers: [
      { type: "LEI", value: "ABCDEF123456789012GH", verified: true }
    ],
    addresses: [
      {
        type: "registered",
        lines: ["456 Business Park"],
        locality: "Manchester",
        country: "GB"
      }
    ],
    relationships: []
  }
];

export const CompanySearch = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<typeof mockCompanies[0] | null>(null);

  const filteredCompanies = mockCompanies.filter(company =>
    company.legal_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    company.trading_names.some(name => name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      {/* Search Panel */}
      <div className="space-y-4">
        <Card className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies by name, ID, or domain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </Card>

        <div className="space-y-2">
          {filteredCompanies.map((company) => (
            <Card
              key={company.id}
              className={`p-4 cursor-pointer transition-colors hover:bg-accent/50 ${
                selectedCompany?.id === company.id ? "border-primary bg-accent/30" : ""
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
          <Card className="p-12">
            <div className="text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a company to view details</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

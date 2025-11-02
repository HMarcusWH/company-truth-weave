import { useEffect, useMemo, useState } from "react";
import { Database, ExternalLink, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

// Fact type used in UI
type Fact = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  qualifier?: string;
  confidence: number;
  status: string;
  evidence_doc?: string;
  evidence_snippet?: string;
  evidence_url?: string;
  created_at: string;
};

export const FactsBrowser = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [facts, setFacts] = useState<Fact[]>([]);
  const [selectedFact, setSelectedFact] = useState<Fact | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // Try with explicit FK first
      let { data, error } = await (supabase as any)
        .from('facts')
        .select('id, subject, predicate, object, confidence, status, created_at, evidence_text, evidence_url, documents!fk_facts_evidence_doc(title, full_text, source_url)')
        .order('created_at', { ascending: false })
        .limit(100);
      
      // Fallback without embed if relationship error occurs
      if (error && error.message.includes('more than one relationship')) {
        const fallback = await (supabase as any)
          .from('facts')
          .select('id, subject, predicate, object, confidence, status, created_at, evidence_text, evidence_url')
          .order('created_at', { ascending: false })
          .limit(100);
        data = fallback.data;
        error = fallback.error;
      }
      
      if (error) {
        toast({ title: 'Failed to load facts', description: error.message } as any);
        return;
      }
      if (cancelled) return;
      const mapped: Fact[] = (data ?? []).map((f: any) => ({
        id: f.id,
        subject: f.subject,
        predicate: f.predicate,
        object: f.object,
        confidence: Number(f.confidence ?? 0),
        status: f.status,
        evidence_doc: f.documents?.title,
        evidence_snippet: f.evidence_text || (f.documents?.full_text ? f.documents.full_text.slice(0, 160) + '…' : undefined),
        evidence_url: f.evidence_url || f.documents?.source_url || undefined,
        created_at: f.created_at,
      }));
      setFacts(mapped);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const filteredFacts = useMemo(() => facts.filter(fact =>
    fact.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fact.predicate.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fact.object.toLowerCase().includes(searchQuery.toLowerCase())
  ), [facts, searchQuery]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "verified":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "pending":
        return <Clock className="h-4 w-4 text-warning" />;
      case "disputed":
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case "superseded":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Database className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "verified":
        return "bg-success text-success-foreground";
      case "pending":
        return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300";
      case "disputed":
        return "bg-warning text-warning-foreground";
      case "superseded":
        return "bg-muted text-muted-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      {/* Facts List */}
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">
              {filteredFacts.length} fact{filteredFacts.length !== 1 ? 's' : ''}
            </span>
          </div>
          <Input
            placeholder="Search facts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </Card>

        <div className="space-y-2">
          {filteredFacts.map((fact) => (
            <Card
              key={fact.id}
              className={`p-4 cursor-pointer transition-colors hover:bg-accent/50 ${
                selectedFact?.id === fact.id ? "border-primary bg-accent/30" : ""
              }`}
              onClick={() => setSelectedFact(fact)}
            >
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  {getStatusIcon(fact.status)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-1">{fact.subject}</p>
                    <p className="text-xs text-muted-foreground">{fact.predicate}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`text-xs ${getStatusColor(fact.status)}`}>
                    {fact.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(fact.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Fact Detail */}
      <div>
        {selectedFact ? (
          <Card className="p-6">
            <div className="space-y-6">
              {/* Header */}
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2 className="text-2xl font-bold text-foreground">Fact Details</h2>
                  <Badge className={getStatusColor(selectedFact.status)}>
                    {selectedFact.status}
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Triple */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Normalized Triple</h3>
                <div className="space-y-2">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-xs font-medium text-muted-foreground">Subject</span>
                    <p className="text-sm font-medium">{selectedFact.subject}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-xs font-medium text-muted-foreground">Predicate</span>
                    <p className="text-sm font-medium">{selectedFact.predicate}</p>
                  </div>
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-xs font-medium text-muted-foreground">Object</span>
                    <p className="text-sm font-medium">{selectedFact.object}</p>
                  </div>
                  {selectedFact.qualifier && (
                    <div className="p-3 bg-muted/50 rounded-lg">
                      <span className="text-xs font-medium text-muted-foreground">Qualifier</span>
                      <p className="text-sm font-medium">{selectedFact.qualifier}</p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Evidence */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Evidence & Provenance
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <span className="text-xs font-medium text-muted-foreground">Source Document</span>
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-medium">
                        {selectedFact.evidence_doc ?? (
                          <span className="text-muted-foreground italic">No source document linked</span>
                        )}
                      </p>
                      {selectedFact.evidence_url && (
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 h-auto self-start"
                          onClick={() => window.open(selectedFact.evidence_url!, '_blank', 'noopener,noreferrer')}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          View source
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="p-3 bg-accent/20 border border-accent rounded-lg">
                    <span className="text-xs font-medium text-muted-foreground mb-2 block">
                      Citation
                    </span>
                    <p className="text-sm italic">
                      {selectedFact.evidence_snippet ? `"${selectedFact.evidence_snippet}"` : (
                        <span className="text-muted-foreground">No citation available</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Metadata */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Quality Metrics</h3>
                <div className="grid gap-2">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Confidence Score</span>
                    <Badge variant={selectedFact.confidence >= 0.95 ? "default" : "secondary"}>
                      {(selectedFact.confidence * 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(selectedFact.status)}
                      <span className="text-sm capitalize">{selectedFact.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Created</span>
                    <span className="text-sm font-mono">
                      {new Date(selectedFact.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-12">
            <div className="text-center text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a fact to view details and evidence</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

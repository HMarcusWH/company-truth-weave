import { useEffect, useMemo, useState } from "react";
import { FileText, Download, ExternalLink, Calendar, Building2, Tag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";

// Document type used in UI
type Doc = {
  id: string;
  title: string;
  doc_type: string;
  entity_name?: string;
  published_date?: string;
  content_preview?: string;
  source_url?: string;
  confidence?: number;
};

export const DocumentLibrary = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from('documents')
        .select('id, title, doc_type, published_at, source_url, raw_text, confidence, entities:entity_id(legal_name)')
        .order('published_at', { ascending: false })
        .limit(100);
      if (error) {
        toast({ title: 'Failed to load documents', description: error.message } as any);
        return;
      }
      if (cancelled) return;
      const mapped: Doc[] = (data ?? []).map((d: any) => ({
        id: d.id,
        title: d.title,
        doc_type: d.doc_type,
        entity_name: d.entities?.legal_name,
        published_date: d.published_at ? new Date(d.published_at).toISOString().slice(0,10) : undefined,
        content_preview: d.raw_text?.slice(0, 280),
        source_url: d.source_url,
        confidence: d.confidence ?? undefined,
      }));
      setDocs(mapped);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const filteredDocs = useMemo(() =>
    docs.filter(doc =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.entity_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    ), [docs, searchQuery]);

  const getDocTypeColor = (type: string) => {
    switch (type) {
      case "press_release": return "bg-accent text-accent-foreground";
      case "annual_report": return "bg-primary text-primary-foreground";
      case "filing": return "bg-secondary text-secondary-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
      {/* Document List */}
      <div className="space-y-4">
        <Card className="p-4">
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </Card>

        <div className="space-y-2">
          {filteredDocs.map((doc) => (
            <Card
              key={doc.id}
              className={`p-4 cursor-pointer transition-colors hover:bg-accent/50 ${
                selectedDoc?.id === doc.id ? "border-primary bg-accent/30" : ""
              }`}
              onClick={() => setSelectedDoc(doc)}
            >
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-primary mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm line-clamp-2">{doc.title}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`text-xs ${getDocTypeColor(doc.doc_type)}`}>
                    {doc.doc_type.replace('_', ' ')}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{doc.published_date ?? ''}</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {doc.entity_name ?? '—'}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Document Detail */}
      <div>
        {selectedDoc ? (
          <Card className="p-6">
            <div className="space-y-6">
              {/* Header */}
              <div>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <h2 className="text-2xl font-bold text-foreground">{selectedDoc.title}</h2>
                  <Badge className={getDocTypeColor(selectedDoc.doc_type)}>
                    {selectedDoc.doc_type.replace('_', ' ')}
                  </Badge>
                </div>
                
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {selectedDoc.published_date ?? ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    {selectedDoc.entity_name ?? '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Tag className="h-4 w-4" />
                    {selectedDoc.source_url ? new URL(selectedDoc.source_url).hostname : '—'}
                  </span>
                </div>

                <div className="flex gap-2">
                  {selectedDoc.source_url && (
                    <Button size="sm" variant="outline" onClick={() => window.open(selectedDoc.source_url!, '_blank') }>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Original
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              {/* Content */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Document Content</h3>
                <div className="prose prose-sm max-w-none">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {selectedDoc.content_preview}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Metadata */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">Extraction Metadata</h3>
                <div className="grid gap-2">
                  {typeof selectedDoc.confidence === 'number' && (
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">Confidence Score</span>
                      <Badge variant={selectedDoc.confidence >= 0.95 ? "default" : "secondary"}>
                        {(selectedDoc.confidence * 100).toFixed(1)}%
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-12">
            <div className="text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Select a document to view details</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

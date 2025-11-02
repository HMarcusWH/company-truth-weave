import { useEffect, useMemo, useState } from "react";
import { FileText, Download, ExternalLink, Calendar, Building2, Tag, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/use-toast";
import AddDocumentForm from "@/components/AddDocumentForm";

// Document type used in UI
type Doc = {
  id: string;
  title: string;
  doc_type: string;
  entity_id?: string | null;
  entity_name?: string;
  published_date?: string;
  content_preview?: string;
  full_text?: string;
  source_url?: string;
  confidence?: number;
};

export const DocumentLibrary = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<string>("all");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Doc | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showFullText, setShowFullText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('documents')
        .select('id, title, doc_type, published_date, source_url, full_text, confidence, entity_name, entity_id')
        .order('published_date', { ascending: false })
        .limit(100);
      if (error) {
        toast({ title: 'Failed to load documents', description: error.message, variant: 'destructive' } as any);
        return;
      }
      const mapped: Doc[] = (data ?? []).map((d: any) => ({
        id: d.id,
        title: d.title,
        doc_type: d.doc_type,
        entity_id: d.entity_id ?? null,
        entity_name: d.entity_name ?? undefined,
        published_date: d.published_date ?? undefined,
        content_preview: d.full_text?.slice(0, 280) ?? undefined,
        full_text: d.full_text ?? undefined,
        source_url: d.source_url ?? undefined,
        confidence: d.confidence ?? undefined,
      }));
      setDocs(mapped);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const entityOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    docs.forEach((doc) => {
      if (doc.entity_id && doc.entity_name) {
        map.set(doc.entity_id, { id: doc.entity_id, name: doc.entity_name });
      } else if (!doc.entity_id && doc.entity_name) {
        const fallbackId = `name:${doc.entity_name.toLowerCase()}`;
        if (!map.has(fallbackId)) {
          map.set(fallbackId, { id: fallbackId, name: doc.entity_name });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [docs]);

  const filteredDocs = useMemo(() =>
    docs.filter((doc) => {
      const matchesSearch =
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.entity_name || '').toLowerCase().includes(searchQuery.toLowerCase());

      const matchesEntity =
        entityFilter === 'all'
          ? true
          : doc.entity_id === entityFilter ||
            (!doc.entity_id && `name:${(doc.entity_name || '').toLowerCase()}` === entityFilter);

      return matchesSearch && matchesEntity;
    }),
  [docs, searchQuery, entityFilter]);

  function getDocTypeColor(dt: string) {
    const map: Record<string, string> = {
      annual_report: "bg-blue-100 text-blue-800",
      interim_report: "bg-cyan-100 text-cyan-800",
      prospectus: "bg-purple-100 text-purple-800",
      sustainability_report: "bg-green-100 text-green-800",
      remuneration_report: "bg-yellow-100 text-yellow-800",
      sec_10k: "bg-indigo-100 text-indigo-800",
      sec_10q: "bg-blue-100 text-blue-800",
      sec_8k: "bg-violet-100 text-violet-800",
      sec_20f: "bg-purple-100 text-purple-800",
      esg_report: "bg-emerald-100 text-emerald-800",
      offering_circular: "bg-pink-100 text-pink-800",
      financial_report: "bg-blue-100 text-blue-800",
      press_release: "bg-green-100 text-green-800",
      proxy_statement: "bg-purple-100 text-purple-800",
      registration: "bg-orange-100 text-orange-800",
    };
    return map[dt] || "bg-gray-100 text-gray-800";
  }

  function getDocTypeLabel(dt: string) {
    const labels: Record<string, string> = {
      annual_report: "Annual Report",
      interim_report: "Interim Report",
      prospectus: "Prospectus",
      sustainability_report: "Sustainability",
      remuneration_report: "Remuneration",
      sec_10k: "10-K",
      sec_10q: "10-Q",
      sec_8k: "8-K",
      sec_20f: "20-F",
      esg_report: "ESG",
      offering_circular: "Offering Circular",
      financial_report: "Financial",
      press_release: "Press Release",
      proxy_statement: "Proxy",
      registration: "Registration",
    };
    return labels[dt] || dt.replace(/_/g, " ");
  }

  return (
    <div className="grid gap-6 grid-cols-1 lg:grid-cols-[400px_1fr]">
      {/* Document List */}
      <div className="space-y-4">
        <Card className="p-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 mb-3">
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="lg:flex-1"
            />
            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Select value={entityFilter} onValueChange={setEntityFilter}>
                  <SelectTrigger className="w-full min-w-[200px]">
                    <SelectValue placeholder="Filter by company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All companies</SelectItem>
                    {entityOptions.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>
                        {entity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {entityFilter !== 'all' && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setEntityFilter('all')}>
                    <span className="sr-only">Clear company filter</span>
                    ×
                  </Button>
                )}
              </div>
            </div>
            <Button onClick={() => setShowUploadDialog(true)} size="default" className="w-full lg:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              <span>Upload</span>
            </Button>
          </div>
        </Card>

        {loading ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 animate-pulse" />
              <p>Loading documents...</p>
            </div>
          </Card>
        ) : filteredDocs.length === 0 ? (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium mb-2">No documents found</p>
              <p className="text-sm">
                {searchQuery 
                  ? 'Try a different search term' 
                  : 'Upload your first document to get started'}
              </p>
            </div>
          </Card>
        ) : (
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
                      <h3 className="font-semibold text-sm line-clamp-2 break-words">{doc.title}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-xs ${getDocTypeColor(doc.doc_type)}`}>
                      {getDocTypeLabel(doc.doc_type)}
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
        )}
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
                    {getDocTypeLabel(selectedDoc.doc_type)}
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
                <div className="relative">
                  <div className={`prose prose-sm max-w-none ${
                    showFullText === selectedDoc.id ? '' : 'max-h-[400px] overflow-hidden'
                  }`}>
                    <p className="text-sm text-foreground leading-relaxed">
                      {showFullText === selectedDoc.id 
                        ? selectedDoc.full_text 
                        : selectedDoc.content_preview}
                    </p>
                  </div>
                  {showFullText !== selectedDoc.id && selectedDoc.full_text && selectedDoc.full_text.length > 280 && (
                    <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-card to-transparent" />
                  )}
                </div>
                {selectedDoc.full_text && selectedDoc.full_text.length > 280 && (
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="mt-2 p-0"
                    onClick={() => setShowFullText(
                      showFullText === selectedDoc.id ? null : selectedDoc.id
                    )}
                  >
                    {showFullText === selectedDoc.id ? 'Show less' : 'Show full document'}
                  </Button>
                )}
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

      {/* Upload Document Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload & Process Document</DialogTitle>
          </DialogHeader>
          <AddDocumentForm onUploaded={() => {
            setShowUploadDialog(false);
            loadDocuments();
          }} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

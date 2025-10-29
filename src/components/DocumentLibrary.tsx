import { useState } from "react";
import { FileText, Download, ExternalLink, Calendar, Building2, Tag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

// Mock document data
const mockDocuments = [
  {
    id: "doc1",
    title: "Q4 2024 Financial Results - Acme Corporation",
    doc_type: "press_release",
    entity_name: "Acme Corporation Ltd",
    published_date: "2024-10-15",
    content_preview: "Acme Corporation today announced record revenue of $450M for Q4 2024, representing 23% year-over-year growth. The company attributes this success to expansion into new markets and strong product adoption.",
    storage_url: "#",
    confidence: 0.98,
    source: "Official Company Website"
  },
  {
    id: "doc2",
    title: "Annual Report 2024 - Global Industries",
    doc_type: "annual_report",
    entity_name: "Global Industries PLC",
    published_date: "2024-09-20",
    content_preview: "This annual report provides a comprehensive overview of Global Industries' operations, financial performance, and strategic initiatives for the fiscal year 2024...",
    storage_url: "#",
    confidence: 1.0,
    source: "Companies House"
  },
  {
    id: "doc3",
    title: "New Partnership Announcement - Acme Corporation",
    doc_type: "press_release",
    entity_name: "Acme Corporation Ltd",
    published_date: "2024-08-05",
    content_preview: "Acme Corporation is pleased to announce a strategic partnership with TechVentures Inc to accelerate innovation in the AI sector...",
    storage_url: "#",
    confidence: 0.95,
    source: "PR Newswire"
  }
];

export const DocumentLibrary = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<typeof mockDocuments[0] | null>(null);

  const filteredDocs = mockDocuments.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.entity_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
                  <span className="text-xs text-muted-foreground">{doc.published_date}</span>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {doc.entity_name}
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
                    {selectedDoc.published_date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    {selectedDoc.entity_name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Tag className="h-4 w-4" />
                    {selectedDoc.source}
                  </span>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  <Button size="sm" variant="outline">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Original
                  </Button>
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
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Confidence Score</span>
                    <Badge variant={selectedDoc.confidence >= 0.95 ? "default" : "secondary"}>
                      {(selectedDoc.confidence * 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Embeddings Generated</span>
                    <Badge variant="outline">Yes</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <span className="text-sm text-muted-foreground">Facts Extracted</span>
                    <Badge variant="outline">12 facts</Badge>
                  </div>
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

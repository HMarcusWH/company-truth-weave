import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const DOC_TYPES_BY_COUNTRY: Record<string, { value: string; label: string }[]> = {
  SE: [
    { value: "annual_report", label: "Årsredovisning (Annual Report)" },
    { value: "interim_report", label: "Delårsrapport (Interim Report)" },
    { value: "prospectus", label: "Prospekt (Prospectus)" },
    { value: "sustainability_report", label: "Hållbarhetsrapport (Sustainability Report)" },
    { value: "remuneration_report", label: "Ersättningsrapport (Remuneration Report)" },
    { value: "press_release", label: "Press Release" },
    { value: "esg_report", label: "ESG Report" },
  ],
  US: [
    { value: "sec_10k", label: "SEC Form 10-K (Annual Report)" },
    { value: "sec_10q", label: "SEC Form 10-Q (Quarterly Report)" },
    { value: "sec_8k", label: "SEC Form 8-K (Current Report)" },
    { value: "sec_20f", label: "SEC Form 20-F (Foreign Annual Report)" },
    { value: "prospectus", label: "Prospectus" },
    { value: "proxy_statement", label: "Proxy Statement" },
    { value: "esg_report", label: "ESG Report" },
  ],
  GLOBAL: [
    { value: "annual_report", label: "Annual Report" },
    { value: "interim_report", label: "Interim/Quarterly Report" },
    { value: "prospectus", label: "Prospectus" },
    { value: "offering_circular", label: "Offering Circular" },
    { value: "press_release", label: "Press Release" },
    { value: "esg_report", label: "ESG Report" },
    { value: "sustainability_report", label: "Sustainability Report" },
  ],
};

type Props = { onUploaded?: (docId: string) => void };

type EntityLite = { id: string; legal_name: string; country_code?: string | null };

export default function AddDocumentForm({ onUploaded }: Props) {
  const { toast } = useToast();
  const [entities, setEntities] = React.useState<EntityLite[]>([]);
  const [entityId, setEntityId] = React.useState<string>("");
  const [docType, setDocType] = React.useState<string>("press_release");
  const [title, setTitle] = React.useState("");
  const [publishedDate, setPublishedDate] = React.useState<string>("");
  const [fullText, setFullText] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id, legal_name, country_code")
        .order("legal_name", { ascending: true });
      if (!error && data) setEntities(data as EntityLite[]);
    })();
  }, []);

  const selectedEntityData = entities.find(e => e.id === entityId);
  const availableDocTypes = selectedEntityData?.country_code 
    ? (DOC_TYPES_BY_COUNTRY[selectedEntityData.country_code] || DOC_TYPES_BY_COUNTRY.GLOBAL)
    : DOC_TYPES_BY_COUNTRY.GLOBAL;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!entityId) { toast({ title: "Pick a company", variant: "destructive" }); return; }
    if (!title.trim() || fullText.trim().length < 20) {
      toast({ title: "Add more content", description: "Title and at least 20 characters of content required.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const ent = entities.find(e => e.id === entityId);
      const { data: doc, error } = await supabase
        .from("documents")
        .insert([{
          entity_id: entityId,
          entity_name: ent?.legal_name ?? null,
          doc_type: docType as any,
          title: title.trim(),
          full_text: fullText,
          content_preview: fullText.slice(0, 280),
          published_date: publishedDate || null,
        }])
        .select("id")
        .single();
      if (error) throw error;

      // Immediately run the pipeline
      const { error: fnError } = await supabase.functions.invoke("coordinator", {
        body: {
          documentText: fullText,
          documentId: doc.id,
          environment: "dev",
        },
      });
      if (fnError) throw fnError;

      toast({ title: "Document uploaded", description: "Pipeline started." });
      onUploaded?.(doc.id);
      setTitle(""); setFullText(""); setPublishedDate("");
      setDocType("press_release"); setEntityId("");
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <Label>Company</Label>
        <Select value={entityId} onValueChange={setEntityId}>
          <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
          <SelectContent>
            {entities.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.legal_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Document type</Label>
        <Select value={docType} onValueChange={(v) => setDocType(v as any)}>
          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            {availableDocTypes.map(dt => (
              <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="E.g., 2024 Q4 Earnings Release" />
      </div>

      <div>
        <Label htmlFor="date">Published date (optional)</Label>
        <Input id="date" type="date" value={publishedDate} onChange={(e)=>setPublishedDate(e.target.value)} />
      </div>

      <div>
        <Label htmlFor="full_text">Content</Label>
        <Textarea id="full_text" value={fullText} onChange={(e)=>setFullText(e.target.value)} rows={10} placeholder="Paste full text here..." />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? "Uploading…" : "Upload & Run Pipeline"}
      </Button>
    </form>
  );
}

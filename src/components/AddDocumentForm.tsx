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

type Props = { onUploaded?: (docId: string) => void };

type EntityLite = { id: string; legal_name: string };

export default function AddDocumentForm({ onUploaded }: Props) {
  const { toast } = useToast();
  const [entities, setEntities] = React.useState<EntityLite[]>([]);
  const [entityId, setEntityId] = React.useState<string>("");
  const [docType, setDocType] = React.useState<"press_release"|"filing"|"financial_report"|"article"|"other">("press_release");
  const [title, setTitle] = React.useState("");
  const [publishedDate, setPublishedDate] = React.useState<string>("");
  const [fullText, setFullText] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("entities")
        .select("id, legal_name")
        .order("legal_name", { ascending: true });
      if (!error && data) setEntities(data as EntityLite[]);
    })();
  }, []);

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
          doc_type: docType,
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
        <Select value={docType} onValueChange={(v)=>setDocType(v as any)}>
          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="press_release">press_release</SelectItem>
            <SelectItem value="filing">filing</SelectItem>
            <SelectItem value="financial_report">financial_report</SelectItem>
            <SelectItem value="article">article</SelectItem>
            <SelectItem value="other">other</SelectItem>
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

import { useState } from "react";
import { Play, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const SAMPLE_DOCUMENT = `Acme Corporation Press Release

San Francisco, CA - March 15, 2024

Acme Corporation (LEI: 549300ABCDEFGHIJ1234), a leading provider of cloud infrastructure solutions, today announced the appointment of John Smith as Chief Executive Officer, effective immediately.

Mr. Smith brings over 20 years of experience in enterprise software and will lead Acme's expansion into the European market. Prior to joining Acme, he served as VP of Engineering at TechCorp International.

"We're thrilled to welcome John to the Acme family," said Board Chair Sarah Johnson. "His expertise in scaling global operations will be invaluable as we enter our next phase of growth."

Acme Corporation, headquartered at 123 Market Street, San Francisco, CA 94102, develops CloudOS, an enterprise orchestration platform used by over 500 Fortune 1000 companies worldwide.

For more information, contact: press@acmecorp.com`;

type PipelineResult = {
  run_id: string;
  node_run_id: string;
  agents_executed: Array<{ agent_name: string; status: string; latency_ms: number }>;
  entities_extracted: number;
  facts_extracted: number;
  facts_approved: number;
  blocked_by_arbiter: number;
  total_latency_ms: number;
};

export const PipelineTest = () => {
  const [documentText, setDocumentText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunPipeline = async () => {
    if (!documentText.trim()) {
      toast({ title: "Document text required", variant: "destructive" });
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      // Create document first
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .insert({
          title: documentText.split('\n')[0].slice(0, 100),
          raw_text: documentText,
          doc_type: 'press_release',
          published_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (docError) throw docError;

      // Call coordinator
      const { data, error: funcError } = await supabase.functions.invoke('coordinator', {
        body: {
          documentText: documentText,
          documentId: docData.id,
          environment: 'dev'
        }
      });

      if (funcError) throw funcError;

      setResult(data);
      toast({ title: "Pipeline executed successfully!", variant: "default" });
    } catch (err: any) {
      console.error('Pipeline error:', err);
      setError(err.message || 'Unknown error occurred');
      toast({ title: "Pipeline failed", description: err.message, variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  const loadSample = () => {
    setDocumentText(SAMPLE_DOCUMENT);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Test Multi-Agent Pipeline</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Paste document text to trigger the full intelligence extraction workflow
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadSample}>
              Load Sample
            </Button>
          </div>

          <Textarea
            placeholder="Paste press release, filing, or article text here..."
            value={documentText}
            onChange={(e) => setDocumentText(e.target.value)}
            className="min-h-[300px] font-mono text-sm"
          />

          <Button
            onClick={handleRunPipeline}
            disabled={isRunning || !documentText.trim()}
            className="w-full"
            size="lg"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Running Pipeline...
              </>
            ) : (
              <>
                <Play className="h-5 w-5 mr-2" />
                Run Pipeline
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Results */}
      {result && (
        <Card className="p-6">
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <h3 className="text-lg font-semibold text-foreground">Pipeline Completed</h3>
            </div>

            <Separator />

            {/* Summary Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Entities Extracted</p>
                <p className="text-2xl font-bold text-foreground">{result.entities_extracted}</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Facts Extracted</p>
                <p className="text-2xl font-bold text-foreground">{result.facts_extracted}</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Facts Approved</p>
                <p className="text-2xl font-bold text-success">{result.facts_approved}</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Total Latency</p>
                <p className="text-2xl font-bold text-foreground">{result.total_latency_ms}ms</p>
              </div>
            </div>

            <Separator />

            {/* Agent Execution Details */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3">Agent Execution Timeline</h4>
              <div className="space-y-2">
                {result.agents_executed.map((agent, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      {agent.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                      <span className="text-sm font-medium">{agent.agent_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={agent.status === 'success' ? 'default' : 'destructive'}>
                        {agent.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{agent.latency_ms}ms</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Metadata */}
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between p-2 bg-muted/20 rounded">
                <span className="text-muted-foreground">Run ID</span>
                <code className="text-xs font-mono">{result.run_id}</code>
              </div>
              <div className="flex items-center justify-between p-2 bg-muted/20 rounded">
                <span className="text-muted-foreground">Node Run ID</span>
                <code className="text-xs font-mono">{result.node_run_id}</code>
              </div>
              {result.blocked_by_arbiter > 0 && (
                <div className="flex items-center justify-between p-2 bg-warning/10 rounded">
                  <span className="text-muted-foreground">Blocked by Arbiter</span>
                  <Badge variant="outline" className="text-warning border-warning">
                    {result.blocked_by_arbiter} items
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card className="p-6 border-destructive">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-destructive mb-2">Pipeline Failed</h3>
              <p className="text-sm text-foreground">{error}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

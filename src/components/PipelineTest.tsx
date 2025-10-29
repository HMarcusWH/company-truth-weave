import { useState } from "react";
import { Play, Loader2, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  success: boolean;
  run_id: string;
  status: string;
  entities_extracted: number;
  facts_extracted: number;
  entities_stored: number;
  facts_stored: number;
  facts_approved: number;
  blocked_by_arbiter: number;
  agents_executed: Array<{ agent_name: string; status: string }>;
  total_latency_ms: number;
  errors?: Array<{ step: string; message: string }>;
};

export const PipelineTest = () => {
  const [documentText, setDocumentText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);

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
          full_text: documentText,
          doc_type: 'press_release',
          published_date: new Date().toISOString().split('T')[0],
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
      
      if (data.status === 'success') {
        toast({ title: `Pipeline completed! ${data.facts_stored || 0} facts stored`, variant: "default" });
      } else if (data.status === 'partial') {
        toast({ title: "Pipeline partially completed", description: "Check details for errors", variant: "default" });
      } else {
        toast({ title: "Pipeline failed", variant: "destructive" });
      }
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
              {result.status === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <AlertCircle className="h-5 w-5 text-warning" />
              )}
              <h3 className="text-lg font-semibold text-foreground">
                Pipeline {result.status === 'success' ? 'Completed' : 'Partially Completed'}
              </h3>
            </div>

            <Separator />

            {/* Summary Metrics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <p className={`text-lg font-bold ${
                  result.status === 'success' ? 'text-success' : 
                  result.status === 'partial' ? 'text-warning' : 'text-destructive'
                }`}>
                  {result.status}
                </p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Extracted</p>
                <p className="text-lg font-bold text-foreground">{result.entities_extracted} entities</p>
                <p className="text-lg font-bold text-foreground">{result.facts_extracted} facts</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Stored</p>
                <p className="text-lg font-bold text-success">{result.entities_stored || 0} entities</p>
                <p className="text-lg font-bold text-success">{result.facts_stored || 0} facts</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Approved</p>
                <p className="text-2xl font-bold text-success">{result.facts_approved || 0}</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Latency</p>
                <p className="text-2xl font-bold text-foreground">{result.total_latency_ms}ms</p>
              </div>
            </div>

            <Separator />

            {/* Agent Execution Details */}
            {result.agents_executed && result.agents_executed.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-3">Agent Execution</h4>
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
                      <Badge variant={agent.status === 'success' ? 'default' : 'destructive'}>
                        {agent.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {result.errors && result.errors.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold text-destructive mb-3">Errors</h4>
                  <div className="space-y-1">
                    {result.errors.map((err, idx) => (
                      <div key={idx} className="p-2 bg-destructive/10 rounded text-sm">
                        <span className="font-semibold">{err.step}:</span> {err.message}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Metadata with Collapsible Raw Output */}
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-muted/20 rounded">
                <span className="text-muted-foreground text-sm">Run ID</span>
                <code className="text-xs font-mono">{result.run_id?.substring(0, 16)}...</code>
              </div>
              
              <Collapsible open={showRawOutput} onOpenChange={setShowRawOutput}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    {showRawOutput ? (
                      <><ChevronUp className="h-4 w-4 mr-2" /> Hide Raw Output</>
                    ) : (
                      <><ChevronDown className="h-4 w-4 mr-2" /> View Raw Output</>
                    )}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <pre className="p-4 bg-muted rounded text-xs overflow-auto max-h-96">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
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

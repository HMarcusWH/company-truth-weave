import { useEffect, useState } from "react";
import { Activity, CheckCircle2, AlertCircle, Clock, Database, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
type SystemStats = {
  total_entities: number;
  total_documents: number;
  total_facts: number;
  active_agents: number;
  last_run?: string;
};

export const IngestionMonitor = () => {
  const [systemStats, setSystemStats] = useState<SystemStats>({
    total_entities: 0,
    total_documents: 0,
    total_facts: 0,
    active_agents: 0,
  });
  const [recentRuns, setRecentRuns] = useState<any[]>([]);
  const [validationSuites, setValidationSuites] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      // counts
      const [entitiesCount, documentsCount, factsCount, agentsCount, lastRunData] = await Promise.all([
        supabase.from('entities').select('*', { count: 'exact', head: true }),
        supabase.from('documents').select('*', { count: 'exact', head: true }),
        supabase.from('facts').select('*', { count: 'exact', head: true }).eq('status', 'verified'),
        supabase.from('agent_definitions').select('*', { count: 'exact', head: true }),
        supabase.from('runs').select('created_at').order('created_at', { ascending: false }).limit(1).single(),
      ]);
      if (entitiesCount.error || documentsCount.error || factsCount.error || agentsCount.error) {
        const err = entitiesCount.error || documentsCount.error || factsCount.error || agentsCount.error;
        toast({ title: 'Failed to load stats', description: err?.message || '' });
      }
      if (cancelled) return;
      setSystemStats((prev) => ({
        ...prev,
        total_entities: entitiesCount.count ?? 0,
        total_documents: documentsCount.count ?? 0,
        total_facts: factsCount.count ?? 0,
        active_agents: agentsCount.count ?? 0,
        last_run: lastRunData.data?.created_at || undefined,
      }));

      // recent coordinator runs
      const { data: runs, error: runsErr } = await supabase
        .from('runs')
        .select('run_id, env_code, status_code, started_at, ended_at, metrics_json')
        .order('started_at', { ascending: false })
        .limit(10);
      if (runsErr) {
        toast({ title: 'Failed to load runs', description: runsErr.message });
      } else if (!cancelled) {
        setRecentRuns((runs ?? []).map((r: any) => {
          const decision = typeof r.metrics_json?.arbiter_decision === 'string'
            ? r.metrics_json.arbiter_decision.toUpperCase()
            : undefined;

          const validation = decision === 'ALLOW'
            ? 'pass'
            : decision === 'WARN'
              ? 'warn'
              : decision === 'BLOCK'
                ? 'fail'
                : 'pending';

          return {
            id: r.run_id,
            agent: `Coordinator (${r.env_code})`,
            task: 'Multi-agent pipeline',
            status: r.status_code,
            started: r.started_at,
            rows_ingested: r.metrics_json?.facts_stored || 0,
            validation,
            latency_ms: r.metrics_json?.total_latency_ms || 0,
          };
        }));
      }

      // validation results
      const { data: validations, error: valErr } = await supabase
        .from('validation_results')
        .select('id, fact_id, validator_type, is_valid, validation_score, validated_at')
        .order('validated_at', { ascending: false })
        .limit(10);
      if (valErr) {
        toast({ title: 'Failed to load validations', description: valErr.message });
      } else if (!cancelled) {
        const grouped = (validations ?? []).reduce((acc: any, v: any) => {
          const suite = v.validator_type;
          if (!acc[suite]) acc[suite] = { passed: 0, total: 0, last_run: v.validated_at };
          acc[suite].total++;
          if (v.is_valid) acc[suite].passed++;
          return acc;
        }, {});
        setValidationSuites(Object.entries(grouped).map(([name, data]: [string, any]) => ({
          name,
          status: data.passed === data.total ? 'pass' : data.passed > 0 ? 'warn' : 'fail',
          tests_passed: data.passed,
          tests_total: data.total,
          last_run: data.last_run,
        })));
      }
    };

    load();

    const channel = supabase
      .channel('runs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' }, () => {
        load();
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
      case "pass":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "warning":
      case "warn":
        return <AlertCircle className="h-4 w-4 text-warning" />;
      case "error":
      case "fail":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
      case "pass":
        return "bg-success text-success-foreground";
      case "warning":
      case "warn":
        return "bg-warning text-warning-foreground";
      case "error":
      case "fail":
        return "bg-destructive text-destructive-foreground";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {/* System Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Entities</p>
              <p className="text-2xl font-bold text-foreground">{systemStats.total_entities.toLocaleString()}</p>
            </div>
            <Database className="h-8 w-8 text-primary opacity-50" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Documents</p>
              <p className="text-2xl font-bold text-foreground">{systemStats.total_documents.toLocaleString()}</p>
            </div>
            <Activity className="h-8 w-8 text-accent opacity-50" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Verified Facts</p>
              <p className="text-2xl font-bold text-foreground">{systemStats.total_facts.toLocaleString()}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-success opacity-50" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Agents</p>
              <p className="text-2xl font-bold text-foreground">{systemStats.active_agents}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-success opacity-50" />
          </div>
        </Card>
      </div>

      {/* Recent Runs */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Recent Coordinator Runs</h2>
        <div className="space-y-3">
          {recentRuns.map((run) => (
            <div key={run.id} className="p-4 bg-muted/30 rounded-lg">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(run.status)}
                    <h3 className="font-semibold text-sm">{run.agent}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">{run.task}</p>
                </div>
                <Badge className={getStatusColor(run.status)}>
                  {run.status}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Started</span>
                  <p className="font-medium">{new Date(run.started).toLocaleTimeString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Facts Stored</span>
                  <p className="font-medium">{run.rows_ingested}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Validation</span>
                  <Badge className={
                    run.validation === 'pass' ? 'bg-success text-success-foreground' :
                    run.validation === 'warn' ? 'bg-warning text-warning-foreground' :
                    run.validation === 'fail' ? 'bg-destructive text-destructive-foreground' :
                    'bg-muted text-muted-foreground'
                  }>
                    {run.validation === 'pass' ? 'ALLOWED' :
                     run.validation === 'warn' ? 'WARNING' :
                     run.validation === 'fail' ? 'BLOCKED' :
                     'PENDING'}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Latency</span>
                  <p className="font-medium">{run.latency_ms}ms</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Validation Results */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Data Quality Validation</h2>
        <div className="space-y-4">
          {validationSuites.map((suite) => (
            <div key={suite.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon(suite.status)}
                  <span className="text-sm font-medium">{suite.name}</span>
                </div>
                <Badge className={getStatusColor(suite.status)}>
                  {suite.tests_passed}/{suite.tests_total} passed
                </Badge>
              </div>
              <Progress 
                value={(suite.tests_passed / suite.tests_total) * 100} 
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">
                Last run: {new Date(suite.last_run).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

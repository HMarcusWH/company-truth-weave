import { Activity, CheckCircle2, AlertCircle, Clock, Database, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// Mock monitoring data
const systemStats = {
  total_entities: 2847,
  total_documents: 12453,
  total_facts: 34821,
  active_agents: 7,
  last_run: "2024-10-29T14:30:00Z"
};

const recentRuns = [
  {
    id: "run1",
    agent: "Researcher Agent",
    task: "Press Release Crawl",
    status: "success",
    started: "2024-10-29T14:30:00Z",
    ended: "2024-10-29T14:45:00Z",
    rows_ingested: 47,
    validation: "pass"
  },
  {
    id: "run2",
    agent: "Resolver Agent",
    task: "Entity Deduplication",
    status: "success",
    started: "2024-10-29T13:00:00Z",
    ended: "2024-10-29T13:20:00Z",
    rows_ingested: 23,
    validation: "pass"
  },
  {
    id: "run3",
    agent: "Writer Agent",
    task: "Fact Extraction",
    status: "warning",
    started: "2024-10-29T12:00:00Z",
    ended: "2024-10-29T12:15:00Z",
    rows_ingested: 156,
    validation: "warn"
  }
];

const validationSuites = [
  {
    name: "entity_identifiers.default",
    status: "pass",
    tests_passed: 6,
    tests_total: 6,
    last_run: "2024-10-29T14:45:00Z"
  },
  {
    name: "entities.default",
    status: "pass",
    tests_passed: 3,
    tests_total: 3,
    last_run: "2024-10-29T14:45:00Z"
  },
  {
    name: "documents.freshness",
    status: "warn",
    tests_passed: 2,
    tests_total: 3,
    last_run: "2024-10-29T14:45:00Z"
  }
];

export const IngestionMonitor = () => {
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
        <h2 className="text-lg font-semibold text-foreground mb-4">Recent Ingestion Runs</h2>
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
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Started</span>
                  <p className="font-medium">{new Date(run.started).toLocaleTimeString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Rows Ingested</span>
                  <p className="font-medium">{run.rows_ingested}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Validation</span>
                  <p className="font-medium capitalize">{run.validation}</p>
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

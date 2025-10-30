import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, FileText, Database, Activity, LogOut, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { CompanySearch } from "@/components/CompanySearch";
import { DocumentLibrary } from "@/components/DocumentLibrary";
import { FactsBrowser } from "@/components/FactsBrowser";
import { IngestionMonitor } from "@/components/IngestionMonitor";
import { PipelineTest } from "@/components/PipelineTest";

const Index = () => {
  const [activeTab, setActiveTab] = useState("test");
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Database className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/95 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-md">
                <Database className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Company Knowledge Graph</h1>
                <p className="text-xs text-muted-foreground">AI-Powered Digital Twins</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">System Active</span>
              </div>
              <Button variant="outline" size="sm" onClick={signOut} className="gap-2">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-10">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <TabsList className="inline-flex h-12 w-full max-w-3xl mx-auto">
            <TabsTrigger value="test" className="flex-1 flex items-center justify-center gap-2 px-6">
              <Zap className="h-4 w-4" />
              <span>Test</span>
            </TabsTrigger>
            <TabsTrigger value="search" className="flex-1 flex items-center justify-center gap-2 px-6">
              <Search className="h-4 w-4" />
              <span>Search</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex-1 flex items-center justify-center gap-2 px-6">
              <FileText className="h-4 w-4" />
              <span>Documents</span>
            </TabsTrigger>
            <TabsTrigger value="facts" className="flex-1 flex items-center justify-center gap-2 px-6">
              <Database className="h-4 w-4" />
              <span>Facts</span>
            </TabsTrigger>
            <TabsTrigger value="monitor" className="flex-1 flex items-center justify-center gap-2 px-6">
              <Activity className="h-4 w-4" />
              <span>Monitor</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="test" className="space-y-6">
            <PipelineTest />
          </TabsContent>

          <TabsContent value="search" className="space-y-6">
            <CompanySearch />
          </TabsContent>

          <TabsContent value="documents" className="space-y-6">
            <DocumentLibrary />
          </TabsContent>

          <TabsContent value="facts" className="space-y-6">
            <FactsBrowser />
          </TabsContent>

          <TabsContent value="monitor" className="space-y-6">
            <IngestionMonitor />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;

import { useState } from "react";
import { Search, Building2, FileText, Database, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CompanySearch } from "@/components/CompanySearch";
import { DocumentLibrary } from "@/components/DocumentLibrary";
import { FactsBrowser } from "@/components/FactsBrowser";
import { IngestionMonitor } from "@/components/IngestionMonitor";

const Index = () => {
  const [activeTab, setActiveTab] = useState("search");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
                <Database className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">Company Knowledge Graph</h1>
                <p className="text-xs text-muted-foreground">AI-Powered Digital Twins</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="h-4 w-4 text-success" />
                <span>System Active</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger value="facts" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Facts</span>
            </TabsTrigger>
            <TabsTrigger value="monitor" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Monitor</span>
            </TabsTrigger>
          </TabsList>

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

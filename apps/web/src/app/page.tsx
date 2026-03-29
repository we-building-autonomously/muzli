"use client";

import { useState, useEffect, useCallback } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Plus, X } from "lucide-react";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Editor } from "@/components/editor/Editor";
import { Results } from "@/components/results/Results";
import type { DatabaseConnection, QueryResult, TableData, VectorSearchContext, DbContext } from "@/types";
import type { DbMetadata } from "@/lib/sql-autocomplete";

const STORAGE_KEY = "muzli:selectedConnectionId";

interface QueryTab {
  id: string;
  label: string;
  queryResult: QueryResult | null;
  tableData: TableData | null;
  error: string | null;
}

let nextTabId = 1;

function createTab(label?: string): QueryTab {
  const id = `tab-${nextTabId++}`;
  return { id, label: label || `Query ${nextTabId - 1}`, queryResult: null, tableData: null, error: null };
}

function MuzliApp() {
  const [selectedConnection, setSelectedConnection] = useState<DatabaseConnection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [restoredConnectionId, setRestoredConnectionId] = useState<string | null>(null);
  const [vectorContext, setVectorContext] = useState<VectorSearchContext | null>(null);
  const [dbContext, setDbContext] = useState<DbContext | null>(null);
  const [dbMetadata, setDbMetadata] = useState<DbMetadata | null>(null);

  // Tabs
  const [tabs, setTabs] = useState<QueryTab[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setRestoredConnectionId(stored);
    } catch {}
  }, []);

  const handleConnectionSelect = (connection: DatabaseConnection | null) => {
    setSelectedConnection(connection);
    // Clear results on all tabs when switching connection
    setTabs((prev) => prev.map((t) => ({ ...t, queryResult: null, tableData: null, error: null })));
    if (!connection || (connection.type !== "pinecone" && connection.type !== "turbopuffer")) {
      setVectorContext(null);
    }
    try {
      if (connection) {
        localStorage.setItem(STORAGE_KEY, connection.id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  };

  const updateActiveTab = useCallback((updates: Partial<QueryTab>) => {
    setTabs((prev) => prev.map((t) => t.id === activeTabId ? { ...t, ...updates } : t));
  }, [activeTabId]);

  const handleQueryExecute = useCallback((result: QueryResult) => {
    updateActiveTab({ queryResult: result, tableData: null, error: null });
  }, [updateActiveTab]);

  const handleQueryError = useCallback((error: string) => {
    updateActiveTab({ error, queryResult: null, tableData: null });
  }, [updateActiveTab]);

  const handleTableSelect = useCallback((data: TableData) => {
    updateActiveTab({ tableData: data, queryResult: null, error: null });
  }, [updateActiveTab]);

  const addTab = () => {
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const closeTab = (tabId: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next[next.length - 1].id);
      }
      return next;
    });
  };

  return (
    <div className="h-screen bg-background text-foreground">
      <div className="border-b">
        <div className="flex h-10 items-center px-3">
          <h1 className="text-sm font-bold">Muzli</h1>
        </div>
      </div>

      <div className="h-[calc(100vh-2.5rem)]">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={25} minSize={20} maxSize={40}>
            <Sidebar
              selectedConnection={selectedConnection}
              onConnectionSelect={handleConnectionSelect}
              onTableSelect={handleTableSelect}
              onVectorContextSelect={setVectorContext}
              onDbContextSelect={setDbContext}
              onDbTreeChange={setDbMetadata}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
              restoredConnectionId={restoredConnectionId}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />

          <Panel defaultSize={75}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={50} minSize={30}>
                <div className="h-full flex flex-col">
                  {/* Tab bar */}
                  {selectedConnection && (
                    <div className="flex items-center border-b bg-muted/30 overflow-x-auto">
                      {tabs.map((tab) => (
                        <div
                          key={tab.id}
                          className={`group flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer border-r border-border/50 transition-colors ${
                            tab.id === activeTabId
                              ? "bg-background text-foreground"
                              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                          }`}
                          onClick={() => setActiveTabId(tab.id)}
                        >
                          <span className="truncate max-w-[100px]">{tab.label}</span>
                          {tabs.length > 1 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                              className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity ml-1"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={addTab}
                        className="flex items-center px-2 py-1.5 text-muted-foreground hover:text-foreground transition-colors"
                        title="New tab"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    <Editor
                      key={activeTabId}
                      selectedConnection={selectedConnection}
                      onQueryExecute={handleQueryExecute}
                      onError={handleQueryError}
                      isLoading={isLoading}
                      setIsLoading={setIsLoading}
                      vectorContext={vectorContext}
                      dbContext={dbContext}
                      dbMetadata={dbMetadata}
                    />
                  </div>
                </div>
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-accent transition-colors" />

              <Panel defaultSize={50} minSize={30}>
                <Results
                  queryResult={activeTab.queryResult}
                  tableData={activeTab.tableData}
                  isLoading={isLoading}
                  connectionType={selectedConnection?.type}
                  error={activeTab.error}
                />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <QueryProvider>
      <MuzliApp />
    </QueryProvider>
  );
}

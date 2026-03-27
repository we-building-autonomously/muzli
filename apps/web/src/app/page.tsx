"use client";

import { useState, useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Editor } from "@/components/editor/Editor";
import { Results } from "@/components/results/Results";
import type { DatabaseConnection, QueryResult, TableData, VectorSearchContext } from "@/types";

const STORAGE_KEY = "muzli:selectedConnectionId";

function MuzliApp() {
  const [selectedConnection, setSelectedConnection] =
    useState<DatabaseConnection | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [restoredConnectionId, setRestoredConnectionId] = useState<string | null>(null);
  const [vectorContext, setVectorContext] = useState<VectorSearchContext | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setRestoredConnectionId(stored);
    } catch {}
  }, []);

  const handleConnectionSelect = (connection: DatabaseConnection | null) => {
    setSelectedConnection(connection);
    setQueryResult(null);
    setTableData(null);
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

  const handleQueryExecute = (result: QueryResult) => {
    setQueryResult(result);
    setTableData(null);
    setQueryError(null);
  };

  const handleQueryError = (error: string) => {
    setQueryError(error);
    setQueryResult(null);
    setTableData(null);
  };

  const handleTableSelect = (data: TableData) => {
    setTableData(data);
    setQueryResult(null);
  };

  const handleVectorContextSelect = (ctx: VectorSearchContext) => {
    setVectorContext(ctx);
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
              onVectorContextSelect={handleVectorContextSelect}
              isLoading={isLoading}
              setIsLoading={setIsLoading}
              restoredConnectionId={restoredConnectionId}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />

          <Panel defaultSize={75}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={50} minSize={30}>
                <Editor
                  selectedConnection={selectedConnection}
                  onQueryExecute={handleQueryExecute}
                  onError={handleQueryError}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  vectorContext={vectorContext}
                />
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-accent transition-colors" />

              <Panel defaultSize={50} minSize={30}>
                <Results
                  queryResult={queryResult}
                  tableData={tableData}
                  isLoading={isLoading}
                  connectionType={selectedConnection?.type}
                  error={queryError}
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

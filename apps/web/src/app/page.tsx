"use client";

import { useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Editor } from "@/components/editor/Editor";
import { Results } from "@/components/results/Results";
import type { DatabaseConnection, QueryResult, TableData } from "@/types";

function MuzliApp() {
  const [selectedConnection, setSelectedConnection] =
    useState<DatabaseConnection | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleConnectionSelect = (connection: DatabaseConnection) => {
    setSelectedConnection(connection);
    setQueryResult(null);
    setTableData(null);
  };

  const handleQueryExecute = (result: QueryResult) => {
    setQueryResult(result);
    setTableData(null);
  };

  const handleTableSelect = (data: TableData) => {
    setTableData(data);
    setQueryResult(null);
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
              isLoading={isLoading}
              setIsLoading={setIsLoading}
            />
          </Panel>

          <PanelResizeHandle className="w-1 bg-border hover:bg-accent transition-colors" />

          <Panel defaultSize={75}>
            <PanelGroup direction="vertical">
              <Panel defaultSize={50} minSize={30}>
                <Editor
                  selectedConnection={selectedConnection}
                  onQueryExecute={handleQueryExecute}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                />
              </Panel>

              <PanelResizeHandle className="h-1 bg-border hover:bg-accent transition-colors" />

              <Panel defaultSize={50} minSize={30}>
                <Results
                  queryResult={queryResult}
                  tableData={tableData}
                  isLoading={isLoading}
                  connectionType={selectedConnection?.type}
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

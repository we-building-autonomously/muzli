"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Play, Loader2, Database } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";
import type { DatabaseConnection, QueryResult } from "@/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
      Loading editor...
    </div>
  ),
});

const SQL_DEFAULT = "-- Welcome to Muzli!\n-- Write your SQL queries here\n\nSELECT version();";

const MONGO_DEFAULT = `// MongoDB Query
// Write your query as JSON
{
  "collection": "users",
  "operation": "find",
  "filter": {},
  "limit": 50
}`;

interface EditorProps {
  selectedConnection: DatabaseConnection | null;
  onQueryExecute: (result: QueryResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export function Editor({
  selectedConnection,
  onQueryExecute,
  isLoading,
  setIsLoading,
}: EditorProps) {
  const isMongo = selectedConnection?.type === "mongodb";
  const [query, setQuery] = useState(SQL_DEFAULT);

  useEffect(() => {
    if (selectedConnection) {
      setQuery(isMongo ? MONGO_DEFAULT : SQL_DEFAULT);
    }
  }, [selectedConnection?.id, isMongo]);

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!selectedConnection) throw new Error("No connection selected");
      return apiClient.executeQuery(selectedConnection.id, query);
    },
    onSuccess: (result) => {
      onQueryExecute(result);
      setIsLoading(false);
    },
    onError: (error: Error) => {
      console.error("Query execution failed:", error);
      setIsLoading(false);
    },
  });

  const handleExecute = () => {
    if (!selectedConnection || !query.trim()) return;
    setIsLoading(true);
    executeMutation.mutate();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 h-10 border-b">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Query Editor</h3>
          {selectedConnection && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Database className="h-3 w-3" />
              {isMongo ? "MongoDB" : selectedConnection.name}
            </div>
          )}
        </div>

        <Button
          onClick={handleExecute}
          disabled={!selectedConnection || !query.trim() || isLoading}
          size="sm"
          className="h-7 text-xs px-2.5"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="mr-1.5 h-3 w-3" />
              Run Query
            </>
          )}
        </Button>
      </div>

      <div className="flex-1">
        {selectedConnection ? (
          <MonacoEditor
            height="100%"
            language={isMongo ? "json" : "sql"}
            theme="vs-dark"
            value={query}
            onChange={(value) => setQuery(value || "")}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              wordWrap: "on",
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 12, bottom: 12 },
              suggestOnTriggerCharacters: true,
              quickSuggestions: true,
              parameterHints: { enabled: true },
              hover: { enabled: true },
            }}
            onMount={(editor, monaco) => {
              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                () => {
                  handleExecute();
                }
              );
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Database className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
              <p className="text-sm">Select a connection to start</p>
              <p className="text-xs mt-0.5">
                Connect to a database from the sidebar
              </p>
            </div>
          </div>
        )}
      </div>

      {selectedConnection && (
        <div className="px-3 py-1.5 border-t text-xs text-muted-foreground">
          Press Ctrl+Enter (Cmd+Enter on Mac) to execute
        </div>
      )}
    </div>
  );
}

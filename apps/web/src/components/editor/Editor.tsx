"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Play, Loader2, Database, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";
import type { DatabaseConnection, QueryResult, VectorSearchContext } from "@/types";

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
{
  "collection": "users",
  "operation": "find",
  "filter": {},
  "limit": 50
}`;

function buildPineconeDefault(ctx?: VectorSearchContext | null) {
  const index = ctx?.index || "my-index";
  const ns = ctx?.namespace ? `\n  "namespace": "${ctx.namespace}",` : "";
  return `{
  "operation": "query",
  "index": "${index}",${ns}
  "vector": [0.1, 0.2, 0.3],
  "topK": 10,
  "includeMetadata": true,
  "includeValues": true
}`;
}

function buildTurbopufferDefault(ctx?: VectorSearchContext | null) {
  const ns = ctx?.index || "my-namespace";
  return `{
  "operation": "query",
  "namespace": "${ns}",
  "vector": [0.1, 0.2, 0.3],
  "top_k": 10,
  "include_vectors": true,
  "include_attributes": true
}`;
}

const PINECONE_LIST_INDEXES = `{
  "operation": "list_indexes"
}`;

interface EditorProps {
  selectedConnection: DatabaseConnection | null;
  onQueryExecute: (result: QueryResult) => void;
  onError?: (error: string) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  vectorContext?: VectorSearchContext | null;
}

export function Editor({
  selectedConnection,
  onQueryExecute,
  onError,
  isLoading,
  setIsLoading,
  vectorContext,
}: EditorProps) {
  const isMongo = selectedConnection?.type === "mongodb";
  const isPinecone = selectedConnection?.type === "pinecone";
  const isTurbopuffer = selectedConnection?.type === "turbopuffer";
  const isVectorDb = isPinecone || isTurbopuffer;
  const isJson = isMongo || isVectorDb;

  const [query, setQuery] = useState(SQL_DEFAULT);

  useEffect(() => {
    if (!selectedConnection) return;
    if (isPinecone) {
      setQuery(buildPineconeDefault(vectorContext));
    } else if (isTurbopuffer) {
      setQuery(buildTurbopufferDefault(vectorContext));
    } else if (isMongo) {
      setQuery(MONGO_DEFAULT);
    } else {
      setQuery(SQL_DEFAULT);
    }
  }, [selectedConnection?.id, isMongo, isPinecone, isTurbopuffer]);

  // Update query when vector context changes (index/namespace selected in sidebar)
  useEffect(() => {
    if (!vectorContext) return;
    if (isPinecone) {
      setQuery(buildPineconeDefault(vectorContext));
    } else if (isTurbopuffer) {
      setQuery(buildTurbopufferDefault(vectorContext));
    }
  }, [vectorContext?.index, vectorContext?.namespace, isPinecone, isTurbopuffer]);

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
      onError?.(error.message);
      setIsLoading(false);
    },
  });

  const handleExecute = () => {
    if (!selectedConnection || !query.trim()) return;
    setIsLoading(true);
    executeMutation.mutate();
  };

  const editorLabel = isVectorDb
    ? "Vector Search"
    : isMongo
      ? "MongoDB"
      : selectedConnection?.name || "";

  const buttonLabel = isVectorDb ? "Search" : "Run Query";
  const buttonIcon = isVectorDb ? (
    <Search className="mr-1.5 h-3 w-3" />
  ) : (
    <Play className="mr-1.5 h-3 w-3" />
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 h-10 border-b">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{isVectorDb ? "Vector Query" : "Query Editor"}</h3>
          {selectedConnection && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Database className="h-3 w-3" />
              {editorLabel}
              {vectorContext?.index && isVectorDb && (
                <span className="text-teal-400">
                  / {vectorContext.index}
                  {vectorContext.namespace ? ` / ${vectorContext.namespace}` : ""}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isPinecone && (
            <Button
              onClick={() => {
                setQuery(PINECONE_LIST_INDEXES);
                setTimeout(handleExecute, 50);
              }}
              disabled={!selectedConnection || isLoading}
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
            >
              List Indexes
            </Button>
          )}
          {isTurbopuffer && (
            <Button
              onClick={() => {
                setQuery('{\n  "operation": "list_namespaces"\n}');
                setTimeout(handleExecute, 50);
              }}
              disabled={!selectedConnection || isLoading}
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2.5"
            >
              List Namespaces
            </Button>
          )}
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
                {buttonIcon}
                {buttonLabel}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1">
        {selectedConnection ? (
          <MonacoEditor
            height="100%"
            language={isJson ? "json" : "sql"}
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

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Play, Loader2, Database, Search } from "lucide-react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/api/client";
import { registerSqlCompletionProvider, type DbMetadata } from "@/lib/sql-autocomplete";
import type { DatabaseConnection, QueryResult, VectorSearchContext } from "@/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center text-muted-foreground text-xs">
      Loading editor...
    </div>
  ),
});

const SQL_DEFAULT = "-- Welcome to Muzli!\n-- Write your SQL queries here\n\nSELECT * FROM \nLIMIT 100;";

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
  const dim = ctx?.dimension || 3;
  return `{
  "operation": "query",
  "index": "${index}",${ns}
  "vector": [${Array(dim).fill("0.0").join(", ")}],
  "topK": 10,
  "includeMetadata": true,
  "includeValues": true
}`;
}

function buildTurbopufferDefault(ctx?: VectorSearchContext | null) {
  const ns = ctx?.namespace || ctx?.index || "my-namespace";
  const dim = ctx?.dimension || 3;
  return `{
  "operation": "query",
  "namespace": "${ns}",
  "vector": [${Array(dim).fill("0.0").join(", ")}],
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
  dbMetadata?: DbMetadata | null;
}

export function Editor({
  selectedConnection,
  onQueryExecute,
  onError,
  isLoading,
  setIsLoading,
  vectorContext,
  dbMetadata,
}: EditorProps) {
  const isMongo = selectedConnection?.type === "mongodb";
  const isPinecone = selectedConnection?.type === "pinecone";
  const isTurbopuffer = selectedConnection?.type === "turbopuffer";
  const isVectorDb = isPinecone || isTurbopuffer;
  const isJson = isMongo || isVectorDb;
  const isSql = !!selectedConnection && !isJson;

  const [query, setQuery] = useState(SQL_DEFAULT);
  const [queryLimit, setQueryLimit] = useState(100);
  const completionProviderRef = useRef<{ dispose: () => void } | null>(null);
  const monacoRef = useRef<any>(null);

  // Use metadata from sidebar (passed via props)
  const metadata = dbMetadata || null;

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

  useEffect(() => {
    if (!vectorContext) return;
    if (isPinecone) setQuery(buildPineconeDefault(vectorContext));
    else if (isTurbopuffer) setQuery(buildTurbopufferDefault(vectorContext));
  }, [vectorContext?.index, vectorContext?.namespace, isPinecone, isTurbopuffer]);

  // Register/re-register completion provider when metadata from sidebar changes
  useEffect(() => {
    if (completionProviderRef.current) {
      completionProviderRef.current.dispose();
      completionProviderRef.current = null;
    }

    if (monacoRef.current && isSql) {
      // Register with whatever metadata we have (empty = keywords only)
      completionProviderRef.current = registerSqlCompletionProvider(
        monacoRef.current,
        metadata || { schemas: [] }
      );
    }

    return () => {
      if (completionProviderRef.current) {
        completionProviderRef.current.dispose();
        completionProviderRef.current = null;
      }
    };
  }, [metadata, isSql]);

  const executeMutation = useMutation({
    mutationFn: () => {
      if (!selectedConnection) throw new Error("No connection selected");
      let finalQuery = query;
      // Auto-inject LIMIT for SQL SELECT queries if not already present
      if (isSql && queryLimit > 0) {
        const trimmed = finalQuery.trim().replace(/;+\s*$/, "");
        const upper = trimmed.toUpperCase();
        if (upper.startsWith("SELECT") && !upper.includes("LIMIT")) {
          finalQuery = trimmed + `\nLIMIT ${queryLimit};`;
        }
      }
      return apiClient.executeQuery(selectedConnection, finalQuery);
    },
    onSuccess: (result) => { onQueryExecute(result); setIsLoading(false); },
    onError: (error: Error) => { onError?.(error.message); setIsLoading(false); },
  });

  const handleExecute = useCallback(() => {
    if (!selectedConnection || !query.trim()) return;
    setIsLoading(true);
    executeMutation.mutate();
  }, [selectedConnection, query, setIsLoading, executeMutation]);

  const editorLabel = isVectorDb ? "Vector Search" : isMongo ? "MongoDB" : selectedConnection?.name || "";
  const buttonLabel = isVectorDb ? "Search" : "Run Query";
  const buttonIcon = isVectorDb ? <Search className="mr-1.5 h-3 w-3" /> : <Play className="mr-1.5 h-3 w-3" />;

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
              {metadata && isSql && (
                <span className="text-emerald-400/50">
                  ({metadata.schemas.reduce((acc, s) => acc + s.tables.length, 0)} tables)
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isPinecone && (
            <Button
              onClick={() => { setQuery(PINECONE_LIST_INDEXES); setTimeout(handleExecute, 50); }}
              disabled={!selectedConnection || isLoading}
              variant="outline" size="sm" className="h-7 text-xs px-2.5"
            >List Indexes</Button>
          )}
          {isTurbopuffer && (
            <Button
              onClick={() => { setQuery('{\n  "operation": "list_namespaces"\n}'); setTimeout(handleExecute, 50); }}
              disabled={!selectedConnection || isLoading}
              variant="outline" size="sm" className="h-7 text-xs px-2.5"
            >List Namespaces</Button>
          )}
          <Button
            onClick={handleExecute}
            disabled={!selectedConnection || !query.trim() || isLoading}
            size="sm" className="h-7 text-xs px-2.5"
          >
            {isLoading ? (
              <><Loader2 className="mr-1.5 h-3 w-3 animate-spin" />Running...</>
            ) : (
              <>{buttonIcon}{buttonLabel}</>
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
              quickSuggestions: { other: true, strings: false, comments: false },
              parameterHints: { enabled: true },
              hover: { enabled: true },
              suggest: {
                showKeywords: true,
                showSnippets: true,
                insertMode: "insert" as const,
                filterGraceful: true,
                shareSuggestSelections: true,
              },
              acceptSuggestionOnCommitCharacter: true,
              tabCompletion: "on",
            }}
            onMount={(editor, monaco) => {
              monacoRef.current = monaco;

              editor.addCommand(
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
                () => { handleExecute(); }
              );

              // Register immediately with whatever metadata we have
              if (isSql) {
                if (completionProviderRef.current) completionProviderRef.current.dispose();
                completionProviderRef.current = registerSqlCompletionProvider(
                  monaco, metadata || { schemas: [] }
                );
              }
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Database className="h-6 w-6 mx-auto mb-1.5 opacity-50" />
              <p className="text-sm">Select a connection to start</p>
              <p className="text-xs mt-0.5">Connect to a database from the sidebar</p>
            </div>
          </div>
        )}
      </div>

      {selectedConnection && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t text-xs text-muted-foreground">
          <span>Ctrl+Enter to execute</span>
          {isSql && (
            <div className="flex items-center gap-1.5">
              <span>Limit:</span>
              {[50, 100, 500, 1000].map((n) => (
                <button
                  key={n}
                  onClick={() => setQueryLimit(n)}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                    queryLimit === n
                      ? "bg-primary/20 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setQueryLimit(0)}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                  queryLimit === 0
                    ? "bg-primary/20 text-primary"
                    : "hover:bg-muted"
                }`}
              >
                No limit
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
